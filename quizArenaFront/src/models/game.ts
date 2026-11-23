/*
 * MODEL — partida (visão do aluno).
 *
 * O backend ainda não possui salas nem partidas. Estes tipos descrevem o
 * que o frontend precisa e servem de proposta de contrato para a equipe
 * de backend.
 */
import type { Question } from './question';

/** Código da sala de demonstração, usado enquanto não há salas reais. */
export const DEMO_ROOM_PIN = '123456';
export const PIN_LENGTH = 6;
export const MAX_ROOM_CODE_INPUT_LENGTH = 15;
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;

/**
 * Outro participante da sala. Na demonstração, são jogadores simulados
 * com a pontuação de cada pergunta já definida; com o backend, esses
 * dados virão do servidor a cada rodada.
 */
export interface OpponentPlayer {
    nickname: string;
    /** Pontos obtidos em cada pergunta, na ordem da partida. */
    pointsPerQuestion: number[];
}

export interface GameRoom {
    pin: string;
    /** Id da sala do professor; null na sala de demonstração (sem relatório). */
    roomId: string | null;
    title: string;
    /** Tempo para responder cada pergunta, em segundos. */
    timePerQuestion: number;
    questions: Question[];
    opponents: OpponentPlayer[];
    /** Indica que a sala é simulada no frontend. */
    isDemo: boolean;
}

export interface PlayerLobbyRoomSource {
    id: string;
    code: string;
    name?: string | null;
    questionTime: number;
    host: {
        name: string;
    };
}

/**
 * Converte os dados do lobby retornados pela API no modelo `GameRoom` exibido ao jogador,
 * usando o nome real da sala e recorrendo a "Sala de <anfitrião>" somente quando ausente.
 */
export function mapLobbyToPlayerGameRoom(lobby: PlayerLobbyRoomSource): GameRoom {
    const resolvedName =
        typeof lobby.name === 'string' && lobby.name.trim().length > 0
            ? lobby.name.trim()
            : `Sala de ${lobby.host.name}`;

    return {
        pin: lobby.code,
        roomId: lobby.id,
        title: resolvedName,
        timePerQuestion: lobby.questionTime,
        questions: [],
        opponents: [],
        isDemo: false,
    };
}

/** Linha do ranking. */
export interface RankingEntry {
    position: number;
    nickname: string;
    score: number;
    isCurrentPlayer: boolean;
}

/**
 * Monta o ranking após `answeredCount` perguntas: soma os pontos de cada
 * participante até ali e ordena do maior para o menor. Em caso de empate,
 * o aluno atual aparece antes (critério simples e estável para a demo).
 */
export function buildRanking(
    player: { nickname: string; score: number },
    opponents: OpponentPlayer[],
    answeredCount: number,
): RankingEntry[] {
    const entries = [
        { nickname: player.nickname, score: player.score, isCurrentPlayer: true },
        ...opponents.map((opponent) => ({
            nickname: opponent.nickname,
            score: opponent.pointsPerQuestion
                .slice(0, answeredCount)
                .reduce((sum, points) => sum + points, 0),
            isCurrentPlayer: false,
        })),
    ];

    return entries
        .sort((a, b) => b.score - a.score || Number(b.isCurrentPlayer) - Number(a.isCurrentPlayer))
        .map((entry, index) => ({ ...entry, position: index + 1 }));
}

/** Resposta registrada pelo aluno em uma pergunta. */
export interface PlayerAnswer {
    questionId: string;
    /** null quando o tempo acabou sem resposta. */
    selectedOptionId: string | null;
    isCorrect: boolean;
    points: number;
}

/**
 * Etapas da experiência do aluno:
 * código → apelido → sala de espera → pergunta → resultado da pergunta
 * → (próxima pergunta...) → resultado final.
 */
export type PlayPhase = 'join' | 'nickname' | 'lobby' | 'question' | 'feedback' | 'finished';

const MIN_POINTS = 500;
const SPEED_BONUS = 500;

/**
 * Regra de pontuação: acerto vale de 500 a 1000 pontos, conforme a
 * rapidez da resposta. Erro ou tempo esgotado vale 0.
 */
export function calculatePoints(isCorrect: boolean, timeLeftMs: number, timeLimitMs: number): number {
    if (!isCorrect || timeLimitMs <= 0) return 0;
    const speedRatio = Math.min(Math.max(timeLeftMs / timeLimitMs, 0), 1);
    return Math.round(MIN_POINTS + SPEED_BONUS * speedRatio);
}

export const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/;

/**
 * Normaliza o código da sala removendo espaços antes, depois e no meio,
 * e padronizando letras para maiúsculas.
 */
export function normalizeRoomCode(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Normaliza a entrada de um campo de código de sala (digitação ou colagem):
 * remove todos os espaços, converte letras para maiúsculas e aplica o limite
 * de 6 caracteres úteis (PIN_LENGTH) ao valor já normalizado.
 */
export function normalizeRoomCodeInput(value: string): string {
    return normalizeRoomCode(value).slice(0, PIN_LENGTH);
}

/**
 * Verifica se o código normalizado possui exatamente 6 caracteres alfanuméricos.
 */
export function isValidRoomCode(value: string): boolean {
    return ROOM_CODE_REGEX.test(normalizeRoomCode(value));
}

/**
 * Valida o código da sala e retorna uma mensagem clara de erro, ou null quando válido.
 */
export function validateRoomCode(value: string): string | null {
    const normalized = normalizeRoomCode(value);

    if (!normalized) {
        return 'Informe o código da sala.';
    }

    if (!/^[A-Z0-9]+$/.test(normalized)) {
        return 'O código da sala deve conter apenas letras e números.';
    }

    if (normalized.length !== PIN_LENGTH) {
        return `O código da sala deve possuir ${PIN_LENGTH} caracteres.`;
    }

    return null;
}

/** Normaliza o código informado para exibição/estado em campos de entrada (máx. 6 caracteres úteis). */
export function sanitizePin(value: string): string {
    return normalizeRoomCodeInput(value);
}

/**
 * Estado limpo inicial do jogador antes de entrar em uma partida.
 * Utilizado ao sair ou ao optar por jogar uma nova partida para garantir
 * que token, pontuação, respostas e lobby anteriores não sejam reutilizados.
 */
export function createCleanPlayerMatchState() {
    return {
        phase: 'join' as PlayPhase,
        pin: '',
        nickname: '',
        room: null as GameRoom | null,
        playerId: null as string | null,
        sessionToken: null as string | null,
        lobbyPlayers: [] as { id: string; nickname: string; score: number; joinedAt: string }[],
        currentRoundId: null as string | null,
        currentQuestion: null as Question | null,
        questionNumber: 1,
        selectedOptionId: null as string | null,
        hasSubmittedAnswer: false,
        isSubmittingAnswer: false,
        answerError: null as string | null,
        playedQuestions: [] as Question[],
        answers: [] as PlayerAnswer[],
        serverRanking: [] as RankingEntry[],
        serverTotalScore: 0,
        error: null as string | null,
    };
}

/**
 * Monta a rota de entrada do jogador com o código normalizado e validado na query string.
 */
export function buildPlayRouteWithPin(pin: string, playRoute = '/jogar'): string {
    const cleanPin = normalizeRoomCode(pin);
    return isValidRoomCode(cleanPin)
        ? `${playRoute}?codigo=${encodeURIComponent(cleanPin)}`
        : playRoute;
}

interface HttpErrorLike {
    status: number;
    message?: string;
}

function isHttpErrorLike(error: unknown): error is HttpErrorLike {
    return (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
    );
}

/**
 * Formata erros de verificação/entrada de sala em mensagens amigáveis e claras,
 * diferenciando formato inválido, sala inexistente, encerrada, em andamento,
 * lotada e falha de conexão com o servidor.
 */
export function formatRoomAvailabilityError(error: unknown): string {
    if (isHttpErrorLike(error)) {
        if (error.status === 404) {
            return 'Sala não encontrada. Verifique o código informado.';
        }

        if (error.status === 409) {
            const msg = error.message?.trim();
            if (msg) {
                return msg;
            }
            return 'Esta sala não está disponível para entrada no momento.';
        }

        if (error.status === 400) {
            const msg = error.message?.trim();
            if (msg && !msg.startsWith('Erro na requisição')) {
                return msg;
            }
            return `O código da sala deve possuir ${PIN_LENGTH} caracteres.`;
        }

        if (error.status >= 500) {
            return 'Não foi possível verificar a sala no momento. Tente novamente em instantes.';
        }
    }

    if (error instanceof Error) {
        const message = error.message.trim();
        const lower = message.toLowerCase();

        if (
            lower.includes('conectar ao servidor') ||
            lower.includes('failed to fetch') ||
            lower.includes('networkerror') ||
            lower.includes('network request failed') ||
            lower.includes('load failed')
        ) {
            return 'Não foi possível conectar ao servidor. Verifique sua conexão.';
        }

        if (
            message &&
            !lower.startsWith('typeerror') &&
            !lower.startsWith('syntaxerror') &&
            !lower.startsWith('referenceerror') &&
            !lower.includes('unexpected token')
        ) {
            return message;
        }
    }

    return 'Não foi possível verificar a sala. Verifique sua conexão e tente novamente.';
}

export interface ExecuteVerifyRoomCodeParams {
    rawCode: string;
    lockRef: { current: boolean };
    checkAvailability: (cleanCode: string) => Promise<{ code: string; available: boolean }>;
    setIsLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    onNormalizedCode?: (cleanCode: string) => void;
    onSuccess: (cleanCode: string) => void;
}

/**
 * Fluxo compartilhado entre a Landing Page e a tela /jogar para validar o formato
 * e consultar a existência/disponibilidade da sala no backend antes de avançar.
 */
export async function executeVerifyRoomCode({
    rawCode,
    lockRef,
    checkAvailability,
    setIsLoading,
    setError,
    onNormalizedCode,
    onSuccess,
}: ExecuteVerifyRoomCodeParams): Promise<boolean> {
    if (lockRef.current) {
        return false;
    }

    const cleanCode = normalizeRoomCode(rawCode);
    onNormalizedCode?.(cleanCode);

    const validationError = validateRoomCode(cleanCode);
    if (validationError) {
        setError(validationError);
        return false;
    }

    lockRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
        const availability = await checkAvailability(cleanCode);

        if (!availability || availability.available !== true) {
            setError('Esta sala não está disponível para entrada no momento.');
            return false;
        }

        const verifiedCode = normalizeRoomCode(availability.code || cleanCode);
        onNormalizedCode?.(verifiedCode);
        onSuccess(verifiedCode);
        return true;
    } catch (error) {
        setError(formatRoomAvailabilityError(error));
        return false;
    } finally {
        lockRef.current = false;
        setIsLoading(false);
    }
}

export function formatLeaveRoomError(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return 'Não foi possível sair da sala. Tente novamente.';
}

export interface ExecuteLeaveRoomParams {
    phase: PlayPhase;
    sessionToken: string | null;
    lockRef: { current: boolean };
    requestLeave: (sessionToken: string) => Promise<unknown>;
    setIsLeaving: (leaving: boolean) => void;
    setError: (error: string | null) => void;
    onLeft: () => void;
}

/**
 * Executa a saída voluntária do jogador evitando duplicação de chamadas,
 * tratando loading/erros e limpando o estado local apenas após confirmação.
 */
export async function executeLeaveRoom({
    phase,
    sessionToken,
    lockRef,
    requestLeave,
    setIsLeaving,
    setError,
    onLeft,
}: ExecuteLeaveRoomParams): Promise<boolean> {
    if (lockRef.current) {
        return false;
    }

    if (!sessionToken || phase === 'join' || phase === 'nickname' || phase === 'finished') {
        onLeft();
        return true;
    }

    lockRef.current = true;
    setIsLeaving(true);
    setError(null);

    try {
        await requestLeave(sessionToken);
        onLeft();
        return true;
    } catch (error) {
        setError(formatLeaveRoomError(error));
        return false;
    } finally {
        lockRef.current = false;
        setIsLeaving(false);
    }
}

/**
 * Indica se o erro HTTP significa sessão definitivamente inválida, expirada,
 * pertencente a jogador LEFT/removido ou sala encerrada/arquivada.
 */
export function shouldClearPlayerSessionOnError(error: unknown): boolean {
    if (!isHttpErrorLike(error)) {
        return false;
    }

    return error.status === 401 || error.status === 403 || error.status === 404 || error.status === 409;
}

export interface PersistedPlayerSessionRef {
    sessionToken: string;
    roomCode: string;
    roomId: string;
    gameId: string;
    playerId: string;
    nickname: string;
}

export interface RecoverableLobbyLike {
    id: string;
    code: string;
    roomStatus?: string;
    currentGame?: {
        id: string;
        status: string;
    } | null;
}

export interface ExecuteRecoverPlayerSessionParams<TLobby extends RecoverableLobbyLike> {
    persistedSession: PersistedPlayerSessionRef | null;
    lockRef: { current: boolean };
    fetchLobby: (roomCode: string, sessionToken: string) => Promise<TLobby>;
    setIsRecovering: (recovering: boolean) => void;
    setError: (error: string | null) => void;
    onRecovered: (lobby: TLobby, session: PersistedPlayerSessionRef) => void;
    onSessionInvalid: () => void;
}

/**
 * Coordena a recuperação idempotente da sessão do jogador ao abrir ou atualizar /jogar,
 * validando a sessão via backend sem executar novo joinRoom nem entrar em loop.
 */
export async function executeRecoverPlayerSession<TLobby extends RecoverableLobbyLike>({
    persistedSession,
    lockRef,
    fetchLobby,
    setIsRecovering,
    setError,
    onRecovered,
    onSessionInvalid,
}: ExecuteRecoverPlayerSessionParams<TLobby>): Promise<'none' | 'skipped' | 'recovered' | 'invalid' | 'error'> {
    if (!persistedSession) {
        setIsRecovering(false);
        return 'none';
    }

    if (lockRef.current) {
        return 'skipped';
    }

    lockRef.current = true;
    setIsRecovering(true);
    setError(null);

    try {
        const lobby = await fetchLobby(persistedSession.roomCode, persistedSession.sessionToken);
        const currentGame = lobby?.currentGame;

        if (
            !lobby ||
            lobby.roomStatus === 'ARCHIVED' ||
            !currentGame ||
            currentGame.id !== persistedSession.gameId
        ) {
            onSessionInvalid();
            return 'invalid';
        }

        onRecovered(lobby, persistedSession);
        return 'recovered';
    } catch (error) {
        if (shouldClearPlayerSessionOnError(error)) {
            onSessionInvalid();
            return 'invalid';
        }

        setError(
            error instanceof Error && error.message.trim().length > 0
                ? error.message
                : 'Não foi possível recuperar sua sessão.',
        );
        return 'error';
    } finally {
        lockRef.current = false;
        setIsRecovering(false);
    }
}
