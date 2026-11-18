import { PIN_LENGTH, normalizeRoomCode, validateRoomCode } from './game.ts';
import type { BackendRoomStatus, GameMode, LobbyPlayerDto } from '../services/socket.ts';

export type RoomStatus = 'Aguardando' | 'Em Andamento' | 'Finalizado';

export interface Room {
    id: string;
    name: string;
    theme: string;
    /** Tempo para responder cada pergunta, em segundos (questionTime no backend). */
    timeLimit: number;
    maxPlayers: number;
    gameMode: GameMode;
    status: RoomStatus;
    backendStatus: BackendRoomStatus;
    /** Código alfanumérico de 6 caracteres gerado pelo backend. */
    code: string;
    /** IDs das perguntas vinculadas à sala. */
    questionIds: string[];
    players: LobbyPlayerDto[];
}

/** Uma sala precisa de pelo menos 5 perguntas ativas para iniciar no backend. */
export const MIN_ROOM_QUESTIONS = 5;
export const MIN_ROOM_PLAYERS = 2;

export const ROOM_TIME_OPTIONS = [15, 30, 45, 60] as const;

export const GAME_MODE_LABEL: Record<GameMode, string> = {
    CLASSIC: 'Clássico (sem perda de pontos)',
    HARDCORE: 'Hardcore (-30 pts ao errar)',
};

export function mapBackendRoomStatus(status: BackendRoomStatus): RoomStatus {
    switch (status) {
        case 'WAITING':
            return 'Aguardando';
        case 'IN_PROGRESS':
            return 'Em Andamento';
        case 'FINISHED':
        case 'CANCELLED':
            return 'Finalizado';
    }
}

/** Exibe o código em dois blocos (ex.: "482 913" ou "A1B 2C3"), mais fácil de ler na projeção. */
export function formatRoomCode(code: string): string {
    const clean = normalizeRoomCode(code);
    if (clean.length <= 3) return clean;
    return `${clean.slice(0, 3)} ${clean.slice(3, PIN_LENGTH)}`;
}

/** Retorna exclusivamente o código normalizado de 6 caracteres para cópia na área de transferência. */
export function getClipboardRoomCode(code: string): string {
    return normalizeRoomCode(code);
}

/** Alunos só podem entrar em salas que ainda estão aguardando início. */
export function isRoomOpen(room: Room): boolean {
    return room.backendStatus === 'WAITING' && room.status === 'Aguardando';
}

export interface CreateRoomFormInput {
    name: string;
    theme: string;
    maxPlayers: number;
    timeLimit: number;
    gameMode: GameMode;
}

const VALID_GAME_MODES: readonly GameMode[] = ['CLASSIC', 'HARDCORE'];

/**
 * Valida os dados do formulário de criação/edição de sala antes de enviar ao backend.
 * Retorna uma mensagem clara de erro ou null quando os dados são válidos.
 */
export function validateCreateRoomInput(input: CreateRoomFormInput): string | null {
    if (!input.name || !input.name.trim()) {
        return 'Dê um nome de identificação para a sala.';
    }

    if (
        typeof input.maxPlayers !== 'number' ||
        !Number.isInteger(input.maxPlayers) ||
        input.maxPlayers < 2 ||
        input.maxPlayers > 50
    ) {
        return 'A quantidade de jogadores deve ser um número inteiro entre 2 e 50.';
    }

    if (
        typeof input.timeLimit !== 'number' ||
        !Number.isInteger(input.timeLimit) ||
        input.timeLimit < 5 ||
        input.timeLimit > 180
    ) {
        return 'O tempo por pergunta deve ser um número inteiro entre 5 e 180 segundos.';
    }

    if (!VALID_GAME_MODES.includes(input.gameMode)) {
        return 'O modo de jogo selecionado é inválido.';
    }

    return null;
}

interface HttpErrorLike {
    status: number;
    message?: string;
    errors?: Record<string, string>;
}

function isHttpErrorLike(value: unknown): value is HttpErrorLike {
    return (
        typeof value === 'object' &&
        value !== null &&
        'status' in value &&
        typeof (value as { status: unknown }).status === 'number'
    );
}

/**
 * Converte erros de criação/atualização de sala em mensagens amigáveis para o usuário,
 * sem expor detalhes técnicos internos do servidor.
 */
export function formatRoomCreationError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 400) {
            const fieldErrors = error.errors ? Object.values(error.errors).filter(Boolean) : [];
            if (fieldErrors.length > 0) {
                return fieldErrors[0];
            }
            return error.message || 'Dados da sala inválidos. Verifique os campos informados.';
        }

        if (error.status === 401 || error.status === 403) {
            return 'Sua sessão expirou ou você não tem permissão para criar salas. Faça login novamente.';
        }

        if (error.status >= 500) {
            return 'Não foi possível criar a sala devido a uma falha no servidor. Tente novamente em instantes.';
        }

        return error.message || 'Não foi possível criar a sala. Tente novamente.';
    }

    if (error instanceof Error) {
        const msg = error.message || '';
        if (
            msg.includes('Não foi possível conectar ao servidor') ||
            msg.includes('Failed to fetch') ||
            msg.includes('NetworkError')
        ) {
            return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
        }
    }

    return 'Não foi possível criar a sala. Tente novamente.';
}

export interface LoadRoomByCodeDependencies<TLobby> {
    code: string;
    fetchLobby: (normalizedCode: string) => Promise<TLobby>;
    onLoadingChange?: (isLoading: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (lobby: TLobby, normalizedCode: string) => Room;
}

/**
 * Executa o fluxo de busca de sala por código validando o formato antes da requisição HTTP.
 */
export async function executeLoadRoomByCode<TLobby>(
    deps: LoadRoomByCodeDependencies<TLobby>,
): Promise<Room | null> {
    const cleanCode = normalizeRoomCode(deps.code);
    const validationError = validateRoomCode(cleanCode);
    if (validationError) {
        deps.onError(validationError);
        return null;
    }

    deps.onLoadingChange?.(true);
    deps.onError(null);
    try {
        const lobby = await deps.fetchLobby(cleanCode);
        return deps.onSuccess(lobby, cleanCode);
    } catch (err) {
        deps.onError(
            err instanceof Error
                ? err.message
                : 'Não foi possível carregar a sala informada.',
        );
        return null;
    } finally {
        deps.onLoadingChange?.(false);
    }
}

export interface SubmitRoomDependencies<TApiRoom> {
    input: CreateRoomFormInput;
    lockRef: { current: boolean };
    executeRequest: (validInput: CreateRoomFormInput) => Promise<TApiRoom>;
    onSubmittingChange?: (isSubmitting: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (apiRoom: TApiRoom, validInput: CreateRoomFormInput) => void;
}

/**
 * Executa o fluxo de criação/atualização de sala com validação prévia,
 * bloqueio síncrono contra duplo envio e navegação apenas após confirmação do servidor.
 */
export async function executeSubmitRoom<TApiRoom>(
    deps: SubmitRoomDependencies<TApiRoom>,
): Promise<boolean> {
    if (deps.lockRef.current) {
        return false;
    }

    const validationError = validateCreateRoomInput(deps.input);
    if (validationError) {
        deps.onError(validationError);
        return false;
    }

    deps.lockRef.current = true;
    deps.onSubmittingChange?.(true);
    deps.onError(null);

    try {
        const apiRoom = await deps.executeRequest(deps.input);
        deps.onSuccess(apiRoom, deps.input);
        return true;
    } catch (err) {
        deps.onError(formatRoomCreationError(err));
        return false;
    } finally {
        deps.lockRef.current = false;
        deps.onSubmittingChange?.(false);
    }
}
