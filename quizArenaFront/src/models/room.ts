import { PIN_LENGTH, normalizeRoomCode, validateRoomCode } from './game.ts';
import type {
    BackendRoomStatus,
    GameCreatedPayload,
    GameMode,
    LobbyPlayerDto,
    PlayerLeftPayload,
    RoundClosedPayload,
    RoundStartedPayload,
} from '../services/socket.ts';
import type { ApiGameSummary } from '../services/roomStorageService.ts';

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
    /** ID da partida atual associada à sala (currentGame.id no backend). */
    currentGameId?: string | null;
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

/** Exibe ação de "Jogar novamente" quando a partida da sala foi encerrada. */
export function canPlayAgain(room: Room | null): boolean {
    return (
        room !== null &&
        (room.backendStatus === 'FINISHED' || room.backendStatus === 'CANCELLED')
    );
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

/**
 * Remove duplicidades de salas pelo `id`, mantendo a primeira ocorrência na ordem recebida.
 */
export function deduplicateRoomsById(rooms: Room[]): Room[] {
    const seen = new Set<string>();
    const unique: Room[] = [];

    for (const room of rooms) {
        if (!room.id || seen.has(room.id)) continue;
        seen.add(room.id);
        unique.push(room);
    }

    return unique;
}

/**
 * Insere ou atualiza uma sala na lista existente sem gerar duplicação por `id`.
 */
export function upsertRoomInList(currentRooms: Room[], targetRoom: Room): Room[] {
    const exists = currentRooms.some((r) => r.id === targetRoom.id);
    const updated = exists
        ? currentRooms.map((r) => (r.id === targetRoom.id ? targetRoom : r))
        : [targetRoom, ...currentRooms];
    return deduplicateRoomsById(updated);
}

/**
 * Resolve qual sala deve ser selecionada a partir do parâmetro `?sala=XXXXXX`:
 * - Se não houver código na URL, retorna `selectedRoomId: null` (não abre partida automaticamente).
 * - Se houver código na URL, seleciona a sala SOMENTE se ela pertencer à lista do host autenticado.
 * - Se o código na URL não pertencer ao host autenticado, rejeita a seleção e sinaliza limpeza da URL.
 */
export function resolveSelectedRoomIdFromHostRooms(
    hostRooms: Room[],
    requestedUrlCode: string | null | undefined,
): {
    selectedRoomId: string | null;
    matchedRoom: Room | null;
    shouldClearUrlParam: boolean;
} {
    const rawCode = requestedUrlCode ?? '';
    const cleanCode = normalizeRoomCode(rawCode);

    if (!cleanCode) {
        return {
            selectedRoomId: null,
            matchedRoom: null,
            shouldClearUrlParam: false,
        };
    }

    if (validateRoomCode(cleanCode) !== null) {
        return {
            selectedRoomId: null,
            matchedRoom: null,
            shouldClearUrlParam: true,
        };
    }

    const matchedRoom =
        hostRooms.find((room) => normalizeRoomCode(room.code) === cleanCode) ?? null;

    if (!matchedRoom) {
        return {
            selectedRoomId: null,
            matchedRoom: null,
            shouldClearUrlParam: true,
        };
    }

    return {
        selectedRoomId: matchedRoom.id,
        matchedRoom,
        shouldClearUrlParam: false,
    };
}

export function formatHostRoomsLoadError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 401 || error.status === 403) {
            return 'Sua sessão expirou. Faça login novamente para acessar suas salas.';
        }
        if (error.status >= 500) {
            return 'Não foi possível carregar suas salas devido a uma falha no servidor. Tente novamente.';
        }
        if (error.message?.trim()) {
            return error.message.trim();
        }
    }

    if (error instanceof Error) {
        const msg = error.message.trim();
        const lower = msg.toLowerCase();
        if (
            lower.includes('conectar ao servidor') ||
            lower.includes('failed to fetch') ||
            lower.includes('networkerror')
        ) {
            return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        }
    }

    return 'Não foi possível carregar suas salas. Tente novamente.';
}

export interface HostSessionTracker {
    activeSessionKey: string | null;
    requestSeq: number;
}

export interface ExecuteLoadHostRoomsParams<
    TApiRoom extends { id: string; code: string; hostId?: string },
> {
    sessionKey: string | null;
    expectedHostId?: string | null;
    requestedUrlCode?: string | null;
    trackerRef: { current: HostSessionTracker };
    existingRooms?: Room[];
    fetchHostRooms: () => Promise<TApiRoom[]>;
    mapRoom: (apiRoom: TApiRoom, existing?: Room) => Room;
    onResetSessionState: () => void;
    onLoadingChange?: (loading: boolean) => void;
    onError: (error: string | null) => void;
    onSuccess: (result: {
        rooms: Room[];
        selectedRoomId: string | null;
        shouldClearUrlParam: boolean;
    }) => void;
}

/**
 * Carrega as salas persistidas do host autenticado com isolamento estrito entre sessões,
 * descarte de respostas assíncronas atrasadas de sessões anteriores, deduplicação por `id`
 * e resolução segura do parâmetro `?sala=XXXXXX`.
 */
export async function executeLoadHostRooms<
    TApiRoom extends { id: string; code: string; hostId?: string },
>({
    sessionKey,
    expectedHostId,
    requestedUrlCode,
    trackerRef,
    existingRooms = [],
    fetchHostRooms,
    mapRoom,
    onResetSessionState,
    onLoadingChange,
    onError,
    onSuccess,
}: ExecuteLoadHostRoomsParams<TApiRoom>): Promise<Room[] | null> {
    const normalizedSessionKey = sessionKey?.trim() || null;
    const sessionChanged = trackerRef.current.activeSessionKey !== normalizedSessionKey;

    if (sessionChanged) {
        trackerRef.current.activeSessionKey = normalizedSessionKey;
        trackerRef.current.requestSeq += 1;
        onResetSessionState();
    }

    if (!normalizedSessionKey) {
        onLoadingChange?.(false);
        return null;
    }

    trackerRef.current.requestSeq += 1;
    const requestId = trackerRef.current.requestSeq;
    const requestSessionKey = normalizedSessionKey;
    const safeExistingRooms = sessionChanged ? [] : existingRooms;

    onLoadingChange?.(true);
    onError(null);

    try {
        const apiRooms = await fetchHostRooms();

        // Ignora resposta atrasada caso o usuário tenha trocado de sessão ou disparado nova consulta
        if (
            trackerRef.current.requestSeq !== requestId ||
            trackerRef.current.activeSessionKey !== requestSessionKey
        ) {
            return null;
        }

        const ownedApiRooms = expectedHostId
            ? apiRooms.filter((room) => !room.hostId || room.hostId === expectedHostId)
            : apiRooms;

        const existingById = new Map<string, Room>();
        for (const existing of safeExistingRooms) {
            existingById.set(existing.id, existing);
        }

        const mappedRooms = deduplicateRoomsById(
            ownedApiRooms.map((apiRoom) => mapRoom(apiRoom, existingById.get(apiRoom.id))),
        );

        const { selectedRoomId, shouldClearUrlParam } = resolveSelectedRoomIdFromHostRooms(
            mappedRooms,
            requestedUrlCode,
        );

        onSuccess({
            rooms: mappedRooms,
            selectedRoomId,
            shouldClearUrlParam,
        });

        return mappedRooms;
    } catch (error) {
        if (
            trackerRef.current.requestSeq !== requestId ||
            trackerRef.current.activeSessionKey !== requestSessionKey
        ) {
            return null;
        }

        onError(formatHostRoomsLoadError(error));
        return null;
    } finally {
        if (
            trackerRef.current.requestSeq === requestId &&
            trackerRef.current.activeSessionKey === requestSessionKey
        ) {
            onLoadingChange?.(false);
        }
    }
}

/**
 * Formata timestamps nullable (`startedAt`, `finishedAt`, `archivedAt`) com segurança,
 * evitando que `null` ou strings inválidas sejam convertidas para `1969/1970`.
 */
export function formatNullableDateTime(
    value: string | Date | null | undefined,
    fallback = 'Não registrado',
    locale = 'pt-BR',
): string {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return fallback;
    }

    return parsed.toLocaleString(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
    });
}

/**
 * Formata erros HTTP/rede ao iniciar uma nova partida (`POST /rooms/:id/play-again`).
 */
export function formatPlayAgainError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 401) {
            return 'Sua sessão expirou. Faça login novamente para iniciar outra partida.';
        }

        if (error.status === 403) {
            return 'Você não tem permissão para iniciar outra partida nesta sala.';
        }

        if (error.status === 404) {
            return 'Sala não encontrada.';
        }

        if (error.status === 409) {
            return (
                error.message?.trim() ||
                'Não foi possível criar nova partida porque já existe uma partida ativa ou a sala foi arquivada.'
            );
        }

        if (error.status >= 500) {
            return 'Não foi possível preparar uma nova partida devido a uma falha no servidor. Tente novamente em instantes.';
        }

        if (error.message?.trim()) {
            return error.message.trim();
        }
    }

    if (error instanceof Error) {
        const msg = error.message.trim();
        const lower = msg.toLowerCase();
        if (
            lower.includes('conectar ao servidor') ||
            lower.includes('failed to fetch') ||
            lower.includes('networkerror') ||
            lower.includes('network request failed') ||
            lower.includes('load failed')
        ) {
            return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        }
        if (msg) {
            return msg;
        }
    }

    return 'Não foi possível preparar uma nova partida. Tente novamente.';
}

export function formatArchiveRoomError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 401) {
            return 'Sua sessão expirou. Faça login novamente para excluir a sala.';
        }

        if (error.status === 403) {
            return 'Você não tem permissão para excluir esta sala.';
        }

        if (error.status === 404) {
            return 'Sala não encontrada. Atualize a listagem.';
        }

        if (error.status >= 500) {
            return 'Não foi possível excluir a sala devido a uma falha no servidor. Tente novamente.';
        }

        if (error.message?.trim()) {
            return error.message.trim();
        }
    }

    if (error instanceof Error) {
        const msg = error.message.trim();
        const lower = msg.toLowerCase();
        if (
            lower.includes('conectar ao servidor') ||
            lower.includes('failed to fetch') ||
            lower.includes('networkerror') ||
            lower.includes('network request failed') ||
            lower.includes('load failed')
        ) {
            return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        }
        if (msg) {
            return msg;
        }
    }

    return 'Não foi possível excluir a sala. Tente novamente.';
}

export interface ExecuteArchiveRoomDependencies {
    room: Room | null;
    lockRef: { current: boolean };
    requestArchive: (roomId: string) => Promise<unknown>;
    onArchivingChange?: (archiving: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (archivedRoomId: string) => void;
}

/**
 * Arquiva a sala no servidor (`DELETE /rooms/:id`) e só atualiza o estado local
 * após a confirmação efetiva do backend.
 */
export async function executeArchiveRoom({
    room,
    lockRef,
    requestArchive,
    onArchivingChange,
    onError,
    onSuccess,
}: ExecuteArchiveRoomDependencies): Promise<boolean> {
    if (!room || lockRef.current) {
        return false;
    }

    lockRef.current = true;
    onArchivingChange?.(true);
    onError(null);

    try {
        await requestArchive(room.id);
        onSuccess(room.id);
        return true;
    } catch (error) {
        onError(formatArchiveRoomError(error));
        return false;
    } finally {
        lockRef.current = false;
        onArchivingChange?.(false);
    }
}

export function formatFinishMatchError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 401) {
            return 'Sua sessão expirou. Faça login novamente para encerrar a partida.';
        }

        if (error.status === 403) {
            return 'Você não tem permissão para encerrar esta partida.';
        }

        if (error.status === 404) {
            return 'Sala ou partida não encontrada.';
        }

        if (error.status === 409) {
            return error.message?.trim() || 'Esta partida não está em andamento.';
        }

        if (error.status >= 500) {
            return 'Não foi possível encerrar a partida devido a uma falha no servidor. Tente novamente.';
        }

        if (error.message?.trim()) {
            return error.message.trim();
        }
    }

    if (error instanceof Error) {
        const msg = error.message.trim();
        const lower = msg.toLowerCase();
        if (
            lower.includes('conectar ao servidor') ||
            lower.includes('failed to fetch') ||
            lower.includes('networkerror') ||
            lower.includes('network request failed') ||
            lower.includes('load failed')
        ) {
            return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        }
        if (msg) {
            return msg;
        }
    }

    return 'Não foi possível encerrar a partida. Tente novamente.';
}

export interface ExecuteFinishMatchDependencies<TResponse> {
    room: Room | null;
    lockRef: { current: boolean };
    requestFinish: (roomId: string) => Promise<TResponse>;
    onFinishingChange?: (finishing: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (response: TResponse, originalRoom: Room) => void;
}

/**
 * Encerra antecipadamente a partida em andamento (`POST /rooms/:id/finish`),
 * impedindo múltiplos cliques e atualizando o estado somente após resposta do servidor.
 */
export async function executeFinishMatch<TResponse>({
    room,
    lockRef,
    requestFinish,
    onFinishingChange,
    onError,
    onSuccess,
}: ExecuteFinishMatchDependencies<TResponse>): Promise<boolean> {
    if (!room || lockRef.current) {
        return false;
    }

    lockRef.current = true;
    onFinishingChange?.(true);
    onError(null);

    try {
        const response = await requestFinish(room.id);
        onSuccess(response, room);
        return true;
    } catch (error) {
        onError(formatFinishMatchError(error));
        return false;
    } finally {
        lockRef.current = false;
        onFinishingChange?.(false);
    }
}

export function formatCloseRoundError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 401) {
            return 'Sua sessão expirou. Faça login novamente para encerrar a rodada.';
        }

        if (error.status === 403) {
            return 'Você não tem permissão para encerrar esta rodada.';
        }

        if (error.status === 404) {
            return 'Rodada não encontrada.';
        }

        if (error.status === 409) {
            return error.message?.trim() || 'A rodada não está disponível para encerramento.';
        }

        if (error.status >= 500) {
            return 'Não foi possível encerrar a rodada devido a uma falha no servidor. Tente novamente.';
        }

        if (error.message?.trim()) {
            return error.message.trim();
        }
    }

    if (error instanceof Error) {
        const msg = error.message.trim();
        const lower = msg.toLowerCase();
        if (
            lower.includes('conectar ao servidor') ||
            lower.includes('failed to fetch') ||
            lower.includes('networkerror') ||
            lower.includes('network request failed') ||
            lower.includes('load failed')
        ) {
            return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        }
        if (msg) {
            return msg;
        }
    }

    return 'Não foi possível encerrar a rodada. Tente novamente.';
}

export interface ExecuteCloseRoundDependencies<TResponse> {
    roundId: string | null | undefined;
    closingRoundIdRef: { current: string | null };
    requestClose: (roundId: string) => Promise<TResponse>;
    onClosingChange?: (closing: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (response: TResponse, roundId: string) => void;
}

/**
 * Encerra manualmente a rodada ativa no servidor (`POST /rounds/:id/close`)
 * com proteção contra cliques duplicados e sem depender do timer local.
 */
export async function executeCloseRound<TResponse>({
    roundId,
    closingRoundIdRef,
    requestClose,
    onClosingChange,
    onError,
    onSuccess,
}: ExecuteCloseRoundDependencies<TResponse>): Promise<boolean> {
    if (!roundId || closingRoundIdRef.current === roundId) {
        return false;
    }

    closingRoundIdRef.current = roundId;
    onClosingChange?.(true);
    onError(null);

    try {
        const response = await requestClose(roundId);
        onSuccess(response, roundId);
        return true;
    } catch (error) {
        closingRoundIdRef.current = null;
        onError(formatCloseRoundError(error));
        return false;
    } finally {
        onClosingChange?.(false);
    }
}

export interface ExecutePlayAgainDependencies<TApiRoom> {
    room: Room | null;
    lockRef: { current: boolean };
    requestPlayAgain: (roomId: string) => Promise<TApiRoom>;
    mapRoom: (apiRoom: TApiRoom, existing: Room) => Room;
    onLoadingChange?: (loading: boolean) => void;
    onError: (message: string | null) => void;
    onSuccess: (updatedRoom: Room) => void;
}

/**
 * Executa a criação de uma nova partida na mesma sala (`POST /rooms/:id/play-again`)
 * com proteção contra cliques duplicados e atualização sem duplicar a sala.
 */
export async function executePlayAgain<TApiRoom>({
    room,
    lockRef,
    requestPlayAgain,
    mapRoom,
    onLoadingChange,
    onError,
    onSuccess,
}: ExecutePlayAgainDependencies<TApiRoom>): Promise<Room | null> {
    if (!room || lockRef.current) {
        return null;
    }

    lockRef.current = true;
    onLoadingChange?.(true);
    onError(null);

    try {
        const apiRoom = await requestPlayAgain(room.id);
        const mappedRoom = mapRoom(apiRoom, room);
        onSuccess(mappedRoom);
        return mappedRoom;
    } catch (error) {
        onError(formatPlayAgainError(error));
        return null;
    } finally {
        lockRef.current = false;
        onLoadingChange?.(false);
    }
}

/**
 * Aplica o evento `game:created` de forma idempotente:
 * se a sala já estiver apontando para o mesmo `currentGameId`, evita apagar jogadores
 * recém-entrados antes da entrega do evento WebSocket.
 */
export function applyGameCreatedToRooms(
    rooms: Room[],
    payload: GameCreatedPayload,
): { rooms: Room[]; didResetLiveGame: boolean } {
    const target = rooms.find((r) => r.id === payload.roomId);
    if (!target) {
        return { rooms, didResetLiveGame: false };
    }

    const incomingGameId = payload.currentGame?.id ?? null;
    const isSameNewWaitingGame =
        incomingGameId !== null &&
        target.currentGameId === incomingGameId &&
        target.backendStatus === 'WAITING';

    if (isSameNewWaitingGame) {
        return { rooms, didResetLiveGame: false };
    }

    const updatedRooms = rooms.map((room) =>
        room.id === payload.roomId
            ? {
                  ...room,
                  backendStatus: payload.status,
                  status: mapBackendRoomStatus(payload.status),
                  maxPlayers: payload.maxPlayers,
                  timeLimit: payload.questionTime,
                  gameMode: payload.gameMode,
                  ...(incomingGameId !== null ? { currentGameId: incomingGameId } : {}),
                  players: [],
              }
            : room,
    );

    return { rooms: deduplicateRoomsById(updatedRooms), didResetLiveGame: true };
}

/**
 * Calcula quantos segundos restam usando o prazo autoritativo `expiresAt`
 * enviado pelo backend (com fallback apenas defensivo para `openedAt + timeLimit`).
 */
export function computeRemainingSecondsFromDeadline(
    expiresAt: string | number | null | undefined,
    openedAt?: string | number | null,
    timeLimitSeconds = 0,
    nowMs = Date.now(),
): number {
    let deadlineMs = Number.NaN;

    if (typeof expiresAt === 'number') {
        deadlineMs = expiresAt;
    } else if (typeof expiresAt === 'string' && expiresAt.trim()) {
        deadlineMs = Date.parse(expiresAt);
    }

    if (Number.isNaN(deadlineMs)) {
        const openedMs =
            typeof openedAt === 'number'
                ? openedAt
                : typeof openedAt === 'string' && openedAt.trim()
                  ? Date.parse(openedAt)
                  : Number.NaN;

        if (!Number.isNaN(openedMs) && timeLimitSeconds > 0) {
            deadlineMs = openedMs + timeLimitSeconds * 1000;
        }
    }

    if (Number.isNaN(deadlineMs)) {
        return 0;
    }

    return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export interface RecoveredHostMatchState {
    activeRound: RoundStartedPayload['round'] | null;
    closedRound: RoundClosedPayload['round'] | null;
    answeredPlayers: { id: string; nickname: string }[];
    remainingSeconds: number;
}

/**
 * Extrai o estado completo da rodada em andamento ou última rodada fechada
 * a partir do payload `currentGame` retornado pela API ao recarregar (`F5`) ou reconectar.
 */
export function extractHostMatchRecoveryState(
    currentGame: ApiGameSummary | null | undefined,
    nowMs = Date.now(),
): RecoveredHostMatchState {
    if (!currentGame) {
        return {
            activeRound: null,
            closedRound: null,
            answeredPlayers: [],
            remainingSeconds: 0,
        };
    }

    if (currentGame.activeRound && currentGame.activeRound.status === 'OPEN') {
        const round = currentGame.activeRound;
        return {
            activeRound: {
                id: round.id,
                roundNumber: round.roundNumber,
                status: round.status,
                openedAt: round.openedAt,
                expiresAt: round.expiresAt,
                timeLimit: round.timeLimit,
                question: round.question,
            },
            closedRound: null,
            answeredPlayers: round.answeredPlayers ?? [],
            remainingSeconds: computeRemainingSecondsFromDeadline(
                round.expiresAt,
                round.openedAt,
                round.timeLimit,
                nowMs,
            ),
        };
    }

    if (currentGame.status === 'IN_PROGRESS' && currentGame.lastClosedRound) {
        return {
            activeRound: null,
            closedRound: currentGame.lastClosedRound,
            answeredPlayers: [],
            remainingSeconds: 0,
        };
    }

    return {
        activeRound: null,
        closedRound: null,
        answeredPlayers: [],
        remainingSeconds: 0,
    };
}

/**
 * Retorna apenas os participantes elegíveis (exclui LEFT e ABANDONED).
 */
export function countEligiblePlayers(players: readonly LobbyPlayerDto[]): number {
    return players.filter(
        (player) => player.status !== 'LEFT' && player.status !== 'ABANDONED',
    ).length;
}

/**
 * Atualiza a lista de participantes da sala ao receber `player:left`.
 * Em WAITING remove o participante; em IN_PROGRESS marca LEFT preservando o score histórico.
 */
export function applyPlayerLeftToRooms(
    rooms: readonly Room[],
    payload: PlayerLeftPayload,
): Room[] {
    return rooms.map((room) => {
        if (room.id !== payload.roomId) {
            return room;
        }

        if (payload.gameStatus === 'WAITING') {
            return {
                ...room,
                players: room.players.filter((player) => player.id !== payload.player.id),
            };
        }

        return {
            ...room,
            players: room.players.map((player) =>
                player.id === payload.player.id
                    ? { ...player, status: payload.player.status }
                    : player,
            ),
        };
    });
}

export interface StartMatchRequirementsEvaluation {
    canStart: boolean;
    currentPlayers: number;
    requiredPlayers: number;
    missingPlayers: boolean;
    missingPlayersCount: number;
    currentQuestions: number;
    requiredQuestions: number;
    missingQuestions: boolean;
    missingQuestionsCount: number;
    summaryMessage: string | null;
}

/**
 * Avalia no lobby o status visual dos requisitos mínimos para iniciar uma partida.
 * A validação autoritativa permanece no backend em `POST /rooms/:id/start`.
 */
export function evaluateStartMatchRequirements(
    playerCount: number,
    questionCount: number,
): StartMatchRequirementsEvaluation {
    const safePlayers = Math.max(0, playerCount);
    const safeQuestions = Math.max(0, questionCount);
    const missingPlayersCount = Math.max(0, MIN_ROOM_PLAYERS - safePlayers);
    const missingQuestionsCount = Math.max(
        0,
        MIN_ROOM_QUESTIONS - safeQuestions,
    );
    const missingPlayers = missingPlayersCount > 0;
    const missingQuestions = missingQuestionsCount > 0;

    const missingParts: string[] = [];
    if (missingQuestions) {
        missingParts.push(
            `faltam ${missingQuestionsCount} pergunta${missingQuestionsCount === 1 ? '' : 's'} ativa${missingQuestionsCount === 1 ? '' : 's'} (mínimo ${MIN_ROOM_QUESTIONS})`,
        );
    }
    if (missingPlayers) {
        missingParts.push(
            `falta${missingPlayersCount === 1 ? '' : 'm'} ${missingPlayersCount} jogador${missingPlayersCount === 1 ? '' : 'es'} ativo${missingPlayersCount === 1 ? '' : 's'} (mínimo ${MIN_ROOM_PLAYERS})`,
        );
    }

    const summaryMessage =
        missingParts.length === 0
            ? null
            : `Não é possível iniciar a partida: ${missingParts.join(' e ')}.`;

    return {
        canStart: !missingPlayers && !missingQuestions,
        currentPlayers: safePlayers,
        requiredPlayers: MIN_ROOM_PLAYERS,
        missingPlayers,
        missingPlayersCount,
        currentQuestions: safeQuestions,
        requiredQuestions: MIN_ROOM_QUESTIONS,
        missingQuestions,
        missingQuestionsCount,
        summaryMessage,
    };
}

/**
 * Formata falhas de início de partida preservando o feedback detalhado do backend (409)
 * e tratando erros de autenticação, rede ou falhas inesperadas.
 */
export function formatStartMatchError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 409) {
            return (
                error.message ||
                'Não é possível iniciar a partida porque os requisitos mínimos não foram atendidos.'
            );
        }

        if (error.status === 401 || error.status === 403) {
            return 'Sua sessão expirou ou você não tem permissão para iniciar esta partida.';
        }

        if (error.status === 404) {
            return 'Sala não encontrada.';
        }

        if (error.status >= 500) {
            return 'Não foi possível iniciar a partida devido a uma falha no servidor. Tente novamente em instantes.';
        }

        return error.message || 'Não foi possível iniciar a partida.';
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

        if (msg.trim()) {
            return msg;
        }
    }

    return 'Não foi possível iniciar a partida.';
}

export type StartMatchErrorKind = 'requirements' | 'api';

export interface StartMatchFeedbackInput {
    hasAttemptedStart: boolean;
    startMatchError: string | null;
    startMatchErrorKind?: StartMatchErrorKind | null;
}

/**
 * Classifica o erro de tentativa de início entre pendência de requisitos (HTTP 409)
 * e falha de API/autenticação/rede.
 */
export function classifyStartMatchError(error: unknown): StartMatchErrorKind {
    if (isHttpErrorLike(error) && error.status === 409) {
        return 'requirements';
    }
    return 'api';
}

/**
 * Retorna a mensagem de feedback visível na seção de requisitos somente após
 * uma tentativa explícita de iniciar a partida, evitando avisos precoces ao abrir a sala.
 */
export function resolveStartMatchFeedback(
    input: StartMatchFeedbackInput,
): string | null {
    if (!input.hasAttemptedStart || !input.startMatchError) {
        return null;
    }

    return input.startMatchError;
}

/**
 * Indica se o alerta de pendências deve ser limpo automaticamente quando os
 * requisitos da sala passam de incompletos para completos após uma tentativa prévia.
 */
export function shouldClearStartMatchFeedbackOnRequirementsMet(params: {
    previousCanStart: boolean;
    currentCanStart: boolean;
    startMatchErrorKind: StartMatchErrorKind | null;
}): boolean {
    return (
        !params.previousCanStart &&
        params.currentCanStart &&
        params.startMatchErrorKind === 'requirements'
    );
}

export interface StartMatchDependencies<TApiRoom> {
    room: Room | null;
    lockRef: { current: boolean };
    requestStart: (roomId: string) => Promise<TApiRoom>;
    onStartingChange?: (isStarting: boolean) => void;
    onAttemptStart?: () => void;
    onError: (message: string | null, kind?: StartMatchErrorKind | null) => void;
    onStarted: (startedRoom: TApiRoom, originalRoom: Room) => Promise<void> | void;
}

/**
 * Executa o início de partida delegando a validação final ao backend (POST /rooms/:id/start)
 * e impedindo duplo envio enquanto a requisição estiver em andamento.
 */
export async function executeStartMatch<TApiRoom>(
    deps: StartMatchDependencies<TApiRoom>,
): Promise<boolean> {
    if (!deps.room || deps.lockRef.current) {
        return false;
    }

    deps.lockRef.current = true;
    deps.onAttemptStart?.();
    deps.onStartingChange?.(true);
    deps.onError(null, null);

    try {
        const startedRoom = await deps.requestStart(deps.room.id);
        await deps.onStarted(startedRoom, deps.room);
        return true;
    } catch (error) {
        deps.onError(
            formatStartMatchError(error),
            classifyStartMatchError(error),
        );
        return false;
    } finally {
        deps.lockRef.current = false;
        deps.onStartingChange?.(false);
    }
}
