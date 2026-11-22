
import type {
    Game,
    GameMode,
    GamePlayer,
    GameStatus,
    QuestionType,
    Room,
    RoomStatus,
    RoundStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import {
    buildRoundClosedPayload,
    type RoundClosedWirePayload,
} from "../rounds/round.service.js";

import { RoomRepository, selectCurrentGame } from "./room.repository.js";
import { RoomCodeGenerator } from "./room-code-generator.js";
import {
    validateCreateRoom,
    type CreateRoomDto,
} from "./create-room.dto.js";
import { validateUpdateRoom } from "./update-room.dto.js";
import {
    isValidRoomCode,
    normalizeRoomCode,
    validateJoinRoom,
} from "./join-room.dto.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
    RoomReplayNotAllowedError,
    RoomGameNotFoundError,
    RoomNotJoinableError,
    RoomFullError,
    DuplicateNicknameError,
    RoomAuthenticationError,
    RoomStartRequirementsError,
} from "./room.errors.js";
import { RoomPlayerRepository } from "./room-player.repository.js";
import {
    generateRoomPlayerSessionToken,
    hashRoomPlayerSessionToken,
} from "./room-player-session-token.js";
import { JwtService } from "../auth/jwt.service.js";


type RoomRepositoryContract = Pick<
    RoomRepository,
    | "create"
    | "findById"
    | "findByIdWithCurrentGame"
    | "findByCode"
    | "findByCodeWithLobby"
    | "findManyByHostId"
    | "update"
    | "startIfReady"
    | "createNextGame"
    | "archiveByHost"
    | "finishActiveGame"
    | "findGamesByRoomId"
    | "findGameResultsById"
>;

type RoomCodeGeneratorContract = Pick<
    RoomCodeGenerator,
    "generate"
>;

type RoomPlayerRepositoryContract = Pick<
    RoomPlayerRepository,
    "createIfRoomHasCapacity" | "findBySessionTokenHash"
>;

type JwtServiceContract = Pick<JwtService, "verify">;

export type CreateRoomInput = CreateRoomDto & {
    hostId: string;
    questions?: unknown;
};

export type UpdateRoomInput = {
    roomId: string;
    hostId: string;
    data: unknown;
};

export type JoinRoomResult = {
    player: Omit<GamePlayer, "sessionTokenHash"> & { roomId: string };
    sessionToken: string;
};

export type FinishRoomResult = {
    room: ProjectedRoomSummary;
    gameId: string;
    finishedAt: Date;
    alreadyFinished: boolean;
    closedRoundPayload: RoundClosedWirePayload | null;
    ranking: {
        id: string;
        nickname: string;
        score: number;
        position: number;
    }[];
};

export type RoomAvailabilityResult = {
    code: string;
    status: GameStatus;
    roomStatus: RoomStatus;
    available: true;
};

type LobbyPlayerProjection = {
    id: string;
    nickname: string;
    score: number;
    joinedAt: Date;
};

type RoundProjectionRecord = {
    id: string;
    roundNumber: number;
    status: RoundStatus;
    openedAt: Date;
    expiresAt: Date;
    closedAt: Date | null;
    timeLimit: number;
    snapshotQuestion: {
        id: string;
        statement: string;
        type: QuestionType;
        position: number;
        options: {
            id: string;
            text: string;
            isCorrect: boolean;
            position: number;
        }[];
    };
    answers: {
        id: string;
        isCorrect: boolean;
        points: number;
        answeredAt: Date;
        gamePlayer: {
            id: string;
            nickname: string;
        };
        option: {
            id: string;
            text: string;
            isCorrect: boolean;
        };
    }[];
};

type GameWithPlayersProjection = Game & {
    players?: LobbyPlayerProjection[];
    questionSnapshot?: {
        id: string;
        _count?: {
            questions: number;
        };
    } | null;
    rounds?: RoundProjectionRecord[];
};

export type ActiveRoundProjection = {
    id: string;
    roundNumber: number;
    status: RoundStatus;
    openedAt: Date;
    expiresAt: Date;
    timeLimit: number;
    answeredCount: number;
    eligiblePlayerCount: number;
    answeredPlayers: {
        id: string;
        nickname: string;
    }[];
    question: {
        id: string;
        statement: string;
        type: QuestionType;
        position: number;
        options: {
            id: string;
            text: string;
            position: number;
        }[];
    };
};

export type CompletedRoundSummaryProjection = {
    id: string;
    roundNumber: number;
    status: RoundStatus;
    openedAt: Date;
    expiresAt: Date;
    closedAt: Date | null;
};

export type CurrentGameProjection = {
    id: string;
    status: GameStatus;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    playerCount: number;
    eligiblePlayerCount: number;
    totalQuestions: number;
    completedRoundsCount: number;
    completedRounds: CompletedRoundSummaryProjection[];
    activeRound: ActiveRoundProjection | null;
    lastClosedRound: RoundClosedWirePayload["round"] | null;
    players: LobbyPlayerProjection[];
};

export type ProjectedRoomSummary = {
    id: string;
    code: string;
    name: string | null;
    theme: string | null;
    hostId: string;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    status: GameStatus;
    roomStatus: RoomStatus;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    players: LobbyPlayerProjection[];
    currentGame: CurrentGameProjection | null;
};

export type ProjectedRoomLobby = ProjectedRoomSummary & {
    host: {
        id: string;
        name: string;
    };
    playerCount: number;
};

export type GameRankingEntry = {
    id: string;
    nickname: string;
    score: number;
    position: number;
    correctCount: number;
    wrongCount: number;
    answeredCount: number;
    joinedAt: Date;
};

export type GameHistoryItem = {
    id: string;
    roomId: string;
    status: GameStatus;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    durationMs: number | null;
    playerCount: number;
    winner: {
        id: string;
        nickname: string;
        score: number;
    } | null;
    ranking: GameRankingEntry[];
};

export type GameQuestionResultItem = {
    questionId: string;
    statement: string;
    position: number;
    roundNumber: number;
    roundStatus: "OPEN" | "CLOSED";
    answeredCount: number;
    correctCount: number;
    correctRate: number;
};

export type GameResultsDetails = GameHistoryItem & {
    questionCount: number;
    questions: GameQuestionResultItem[];
};

function calculateDurationMs(
    startedAt: Date | null,
    finishedAt: Date | null,
): number | null {
    if (!startedAt || !finishedAt) {
        return null;
    }

    return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function buildGameHistorySummary(game: {
    id: string;
    roomId: string;
    status: GameStatus;
    maxPlayers: number;
    questionTime: number;
    gameMode: GameMode;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    players: {
        id: string;
        nickname: string;
        score: number;
        joinedAt: Date;
    }[];
    rounds: {
        answers: {
            gamePlayerId: string;
            isCorrect: boolean;
        }[];
    }[];
}): GameHistoryItem {
    const answerStatsByPlayer = new Map<
        string,
        { answeredCount: number; correctCount: number }
    >();

    for (const round of game.rounds) {
        for (const answer of round.answers) {
            const current = answerStatsByPlayer.get(answer.gamePlayerId) ?? {
                answeredCount: 0,
                correctCount: 0,
            };
            current.answeredCount += 1;
            if (answer.isCorrect) {
                current.correctCount += 1;
            }
            answerStatsByPlayer.set(answer.gamePlayerId, current);
        }
    }

    const totalRoundsPlayed = game.rounds.length;
    const sortedPlayers = [...game.players].sort(
        (a, b) =>
            b.score - a.score ||
            a.joinedAt.getTime() - b.joinedAt.getTime() ||
            a.id.localeCompare(b.id),
    );

    const ranking: GameRankingEntry[] = sortedPlayers.map((player, index) => {
        const stats = answerStatsByPlayer.get(player.id) ?? {
            answeredCount: 0,
            correctCount: 0,
        };
        const wrongCount = Math.max(
            stats.answeredCount - stats.correctCount,
            totalRoundsPlayed - stats.correctCount,
        );

        return {
            id: player.id,
            nickname: player.nickname,
            score: player.score,
            position: index + 1,
            correctCount: stats.correctCount,
            wrongCount,
            answeredCount: stats.answeredCount,
            joinedAt: player.joinedAt,
        };
    });

    const winner =
        game.status === "FINISHED" && ranking[0]
            ? {
                  id: ranking[0].id,
                  nickname: ranking[0].nickname,
                  score: ranking[0].score,
              }
            : null;

    return {
        id: game.id,
        roomId: game.roomId,
        status: game.status,
        maxPlayers: game.maxPlayers,
        questionTime: game.questionTime,
        gameMode: game.gameMode,
        startedAt: game.startedAt,
        finishedAt: game.finishedAt,
        createdAt: game.createdAt,
        durationMs: calculateDurationMs(game.startedAt, game.finishedAt),
        playerCount: ranking.length,
        winner,
        ranking,
    };
}

function projectRoomWithGame(
    room: Room & { games?: readonly GameWithPlayersProjection[] },
    explicitGame?: GameWithPlayersProjection | null,
): ProjectedRoomSummary {
    const selectedGame =
        explicitGame ??
        (room.games ? selectCurrentGame(room.games) : null);

    const players = selectedGame?.players ?? [];
    const gameRounds = selectedGame?.rounds ?? [];
    const openRound =
        gameRounds.find((round) => round.status === "OPEN") ?? null;
    const closedRounds = gameRounds.filter(
        (round) => round.status === "CLOSED",
    );
    const latestClosedRound = closedRounds[0] ?? null;

    const activeRound: ActiveRoundProjection | null = openRound
        ? {
              id: openRound.id,
              roundNumber: openRound.roundNumber,
              status: openRound.status,
              openedAt: openRound.openedAt,
              expiresAt: openRound.expiresAt,
              timeLimit: openRound.timeLimit,
              answeredCount: openRound.answers.length,
              eligiblePlayerCount: players.length,
              answeredPlayers: openRound.answers.map((answer) => ({
                  id: answer.gamePlayer.id,
                  nickname: answer.gamePlayer.nickname,
              })),
              question: {
                  id: openRound.snapshotQuestion.id,
                  statement: openRound.snapshotQuestion.statement,
                  type: openRound.snapshotQuestion.type,
                  position: openRound.snapshotQuestion.position,
                  options: openRound.snapshotQuestion.options.map((option) => ({
                      id: option.id,
                      text: option.text,
                      position: option.position,
                  })),
              },
          }
        : null;

    const lastClosedRound: RoundClosedWirePayload["round"] | null =
        !openRound && latestClosedRound
            ? buildRoundClosedPayload(latestClosedRound, players).round
            : null;

    const completedRounds: CompletedRoundSummaryProjection[] = [...closedRounds]
        .reverse()
        .map((round) => ({
            id: round.id,
            roundNumber: round.roundNumber,
            status: round.status,
            openedAt: round.openedAt,
            expiresAt: round.expiresAt,
            closedAt: round.closedAt,
        }));

    const currentGame: CurrentGameProjection | null = selectedGame
        ? {
              id: selectedGame.id,
              status: selectedGame.status,
              maxPlayers: selectedGame.maxPlayers,
              questionTime: selectedGame.questionTime,
              gameMode: selectedGame.gameMode,
              startedAt: selectedGame.startedAt,
              finishedAt: selectedGame.finishedAt,
              createdAt: selectedGame.createdAt,
              playerCount: players.length,
              eligiblePlayerCount: players.length,
              totalQuestions:
                  selectedGame.questionSnapshot?._count?.questions ?? 0,
              completedRoundsCount: completedRounds.length,
              completedRounds,
              activeRound,
              lastClosedRound,
              players,
          }
        : null;

    const hasActiveGame =
        selectedGame !== null &&
        (selectedGame.status === "WAITING" ||
            selectedGame.status === "IN_PROGRESS");

    return {
        id: room.id,
        code: room.code,
        name: room.name,
        theme: room.theme,
        hostId: room.hostId,
        maxPlayers: hasActiveGame
            ? selectedGame.maxPlayers
            : room.maxPlayers,
        questionTime: hasActiveGame
            ? selectedGame.questionTime
            : room.questionTime,
        gameMode: hasActiveGame ? selectedGame.gameMode : room.gameMode,
        status: selectedGame?.status ?? "WAITING",
        roomStatus: room.status,
        archivedAt: room.archivedAt,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        players,
        currentGame,
    };
}


function isNicknameUniqueConstraint(error: unknown): boolean {
    if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
    ) {
        return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
        return (
            target.includes("gameId") &&
            target.includes("nickname")
        );
    }

    if (typeof target === "string") {
        return (
            target.includes("gameId") &&
            target.includes("nickname")
        );
    }

    return false;
}

export class RoomService {

    constructor(
        private readonly roomRepository: RoomRepositoryContract =
            new RoomRepository(),
        private readonly codeGenerator: RoomCodeGeneratorContract =
            new RoomCodeGenerator(),
        private readonly roomPlayerRepository: RoomPlayerRepositoryContract =
            new RoomPlayerRepository(),
        private readonly jwtService: JwtServiceContract = {
            verify: (token) => new JwtService().verify(token),
        },
    ) { }


    async createRoom(data: CreateRoomInput): Promise<ProjectedRoomSummary> {
        const validation = validateCreateRoom(data);

        if (!validation.success) {
            throw new InvalidRoomDataError(
                "Dados da sala inválidos.",
                validation.errors,
            );
        }

        const code = await this.codeGenerator.generate();

        const created = await this.roomRepository.create({
            code,
            name: validation.data.name ?? null,
            theme: validation.data.theme ?? null,
            hostId: data.hostId,
            maxPlayers: validation.data.maxPlayers,
            questionTime: validation.data.questionTime,
            gameMode: validation.data.gameMode,
        });

        return projectRoomWithGame(created);
    }

    async listHostRooms(hostId: string): Promise<ProjectedRoomSummary[]> {
        const rooms = await this.roomRepository.findManyByHostId(hostId);
        return rooms.map((room) => projectRoomWithGame(room));
    }

    async updateRoom(data: UpdateRoomInput): Promise<ProjectedRoomSummary> {
        const validation = validateUpdateRoom(data.data);

        if (!validation.success) {
            throw new InvalidRoomDataError(
                "Dados da sala inválidos.",
                validation.errors,
            );
        }

        const room = await this.roomRepository.findByIdWithCurrentGame(
            data.roomId,
        );

        if (!room) {
            throw new RoomNotFoundError();
        }

        if (room.hostId !== data.hostId) {
            throw new RoomAccessDeniedError();
        }

        if (room.status !== "ACTIVE") {
            throw new RoomNotEditableError(
                "Salas arquivadas não podem ser alteradas.",
            );
        }

        const currentGame = selectCurrentGame(room.games);

        if (currentGame?.status === "IN_PROGRESS") {
            throw new RoomNotEditableError(
                "Não é possível alterar configurações durante uma partida em andamento.",
            );
        }

        const waitingGame =
            currentGame?.status === "WAITING" ? currentGame : null;

        if (
            waitingGame &&
            validation.data.maxPlayers !== undefined &&
            validation.data.maxPlayers < waitingGame.players.length
        ) {
            throw new InvalidRoomDataError("Dados da sala inválidos.", {
                maxPlayers: `A quantidade máxima não pode ser menor que os ${waitingGame.players.length} jogadores já presentes no lobby.`,
            });
        }

        const updatedRoom = await this.roomRepository.update(
            room.id,
            validation.data,
            waitingGame?.id ?? null,
        );

        return projectRoomWithGame(updatedRoom);
    }

    async startRoom(
        roomId: string,
        hostId: string,
    ): Promise<ProjectedRoomSummary> {
        const result = await this.roomRepository.startIfReady(
            roomId,
            hostId,
        );

        if (result.success) {
            return projectRoomWithGame(result.room, result.game);
        }

        switch (result.reason) {
            case "ROOM_NOT_FOUND":
                throw new RoomNotFoundError();

            case "ACCESS_DENIED":
                throw new RoomAccessDeniedError();

            case "ROOM_NOT_WAITING":
                throw new RoomNotEditableError(
                    "Esta sala já foi iniciada ou não está disponível para início.",
                );

            case "NOT_ENOUGH_PLAYERS":
            case "NOT_ENOUGH_QUESTIONS":
                throw new RoomStartRequirementsError(result.reason);
        }
    }

    async playAgain(
        roomId: string,
        hostId: string,
    ): Promise<ProjectedRoomSummary> {
        const result = await this.roomRepository.createNextGame(
            roomId,
            hostId,
        );

        if (result.success) {
            return projectRoomWithGame(result.room, result.game);
        }

        switch (result.reason) {
            case "ROOM_NOT_FOUND":
                throw new RoomNotFoundError();

            case "ACCESS_DENIED":
                throw new RoomAccessDeniedError();

            case "ROOM_ARCHIVED":
                throw new RoomNotEditableError(
                    "Não é possível iniciar nova partida em uma sala arquivada.",
                );

            case "ACTIVE_GAME_EXISTS":
                throw new RoomReplayNotAllowedError();
        }
    }

    async archiveRoom(
        roomId: string,
        hostId: string,
    ): Promise<ProjectedRoomSummary> {
        const result = await this.roomRepository.archiveByHost(
            roomId,
            hostId,
        );

        if (result.success) {
            return projectRoomWithGame(result.room);
        }

        switch (result.reason) {
            case "ROOM_NOT_FOUND":
                throw new RoomNotFoundError();

            case "ACCESS_DENIED":
                throw new RoomAccessDeniedError(
                    "Você não tem permissão para excluir esta sala.",
                );
        }
    }

    async finishRoom(
        roomId: string,
        hostId: string,
    ): Promise<FinishRoomResult> {
        const result = await this.roomRepository.finishActiveGame(
            roomId,
            hostId,
        );

        if (result.success) {
            const sortedPlayers = [...result.players].sort(
                (a, b) =>
                    b.score - a.score ||
                    a.joinedAt.getTime() - b.joinedAt.getTime() ||
                    a.id.localeCompare(b.id),
            );

            const ranking = sortedPlayers.map((player, index) => ({
                id: player.id,
                nickname: player.nickname,
                score: player.score,
                position: index + 1,
            }));

            const closedRoundPayload = result.closedRound
                ? buildRoundClosedPayload(result.closedRound, sortedPlayers)
                : null;

            const projectedRoom = projectRoomWithGame(result.room, {
                ...result.game,
                players: sortedPlayers,
            });

            return {
                room: projectedRoom,
                gameId: result.game.id,
                finishedAt: result.game.finishedAt ?? new Date(),
                alreadyFinished: result.alreadyFinished,
                closedRoundPayload,
                ranking,
            };
        }

        switch (result.reason) {
            case "ROOM_NOT_FOUND":
                throw new RoomNotFoundError();

            case "ACCESS_DENIED":
                throw new RoomAccessDeniedError(
                    "Você não tem permissão para encerrar a partida desta sala.",
                );

            case "ROOM_ARCHIVED":
                throw new RoomNotEditableError(
                    "Não é possível encerrar partida em uma sala arquivada.",
                );

            case "GAME_NOT_FOUND":
                throw new RoomGameNotFoundError();

            case "GAME_NOT_IN_PROGRESS":
                throw new RoomNotEditableError(
                    "A partida não está em andamento para ser encerrada.",
                );
        }
    }

    async joinRoom(data: unknown): Promise<JoinRoomResult> {
        const validation = validateJoinRoom(data);

        if (!validation.success) {
            throw new InvalidRoomDataError(
                "Dados para entrar na sala inválidos.",
                validation.errors,
            );
        }

        const { code, nickname } = validation.data;

        const room = await this.roomRepository.findByCode(code);

        if (!room) {
            throw new RoomNotFoundError();
        }

        if (room.status !== "ACTIVE") {
            throw new RoomNotJoinableError();
        }

        const sessionToken = generateRoomPlayerSessionToken();
        const sessionTokenHash =
            hashRoomPlayerSessionToken(sessionToken);

        let createdPlayer: GamePlayer & { roomId: string };

        try {
            createdPlayer =
                await this.roomPlayerRepository.createIfRoomHasCapacity({
                    roomId: room.id,
                    nickname,
                    sessionTokenHash,
                });
        } catch (error) {
            if (error instanceof Error) {
                switch (error.message) {
                    case "ROOM_NOT_FOUND":
                        throw new RoomNotFoundError();

                    case "ROOM_NOT_JOINABLE":
                        throw new RoomNotJoinableError();

                    case "ROOM_FULL":
                        throw new RoomFullError();

                    case "DUPLICATE_NICKNAME":
                        throw new DuplicateNicknameError();
                }
            }

            if (isNicknameUniqueConstraint(error)) {
                throw new DuplicateNicknameError();
            }

            throw error;
        }

        const player: JoinRoomResult["player"] = {
            id: createdPlayer.id,
            gameId: createdPlayer.gameId,
            roomId: createdPlayer.roomId,
            userId: createdPlayer.userId,
            nickname: createdPlayer.nickname,
            score: createdPlayer.score,
            joinedAt: createdPlayer.joinedAt,
        };

        return {
            player,
            sessionToken,
        };
    }

    async checkRoomAvailability(code: string): Promise<RoomAvailabilityResult> {
        const normalizedCode = normalizeRoomCode(code);

        if (!isValidRoomCode(normalizedCode)) {
            throw new InvalidRoomDataError(
                "Código da sala inválido.",
                {
                    code: "O código da sala deve conter 6 caracteres alfanuméricos.",
                },
            );
        }

        const room = await this.roomRepository.findByCodeWithLobby(normalizedCode);

        if (!room) {
            throw new RoomNotFoundError(
                "Sala não encontrada. Verifique o código informado.",
            );
        }

        if (room.status !== "ACTIVE") {
            throw new RoomNotJoinableError("Esta sala foi arquivada.");
        }

        const currentGame = selectCurrentGame(room.games);

        if (!currentGame) {
            throw new RoomNotJoinableError(
                "Esta sala não está aceitando novos jogadores.",
            );
        }

        if (currentGame.status === "FINISHED") {
            throw new RoomNotJoinableError("Esta sala já foi encerrada.");
        }

        if (currentGame.status === "CANCELLED") {
            throw new RoomNotJoinableError("Esta sala foi cancelada.");
        }

        if (currentGame.status !== "WAITING") {
            throw new RoomNotJoinableError(
                "Esta partida já está em andamento e não aceita novos jogadores.",
            );
        }

        if (currentGame.players.length >= currentGame.maxPlayers) {
            throw new RoomFullError();
        }

        return {
            code: room.code,
            status: currentGame.status,
            roomStatus: room.status,
            available: true,
        };
    }

    async getRoomLobby(
        code: string,
        token: string,
    ): Promise<ProjectedRoomLobby> {
        let authenticatedUserId: string | null = null;

        try {
            const payload = this.jwtService.verify(token);
            authenticatedUserId = payload.sub;
        } catch {
            // Tokens que não são JWT válidos serão verificados como sessões de jogadores.
        }

        if (authenticatedUserId) {
            const room = await this.roomRepository.findByCodeWithLobby(code);

            if (!room) {
                throw new RoomNotFoundError();
            }

            if (room.hostId !== authenticatedUserId) {
                throw new RoomAccessDeniedError(
                    "Somente o host pode consultar esta sala com sua conta.",
                );
            }

            if (room.status !== "ACTIVE") {
                throw new RoomNotEditableError(
                    "Esta sala foi arquivada e não está mais disponível.",
                );
            }

            const projected = projectRoomWithGame(room);

            return {
                ...projected,
                host: room.host,
                playerCount: projected.players.length,
            };
        }

        const sessionTokenHash = hashRoomPlayerSessionToken(token);

        const player =
            await this.roomPlayerRepository.findBySessionTokenHash(
                sessionTokenHash,
            );

        if (!player || !player.game) {
            throw new RoomAuthenticationError();
        }

        const room = await this.roomRepository.findByCodeWithLobby(code);

        if (!room) {
            throw new RoomNotFoundError();
        }

        if (room.status !== "ACTIVE") {
            throw new RoomAuthenticationError();
        }

        const currentGame = selectCurrentGame(room.games);

        if (
            player.game.roomId !== room.id ||
            !currentGame ||
            player.gameId !== currentGame.id
        ) {
            throw new RoomAccessDeniedError(
                "Você não participa da partida atual desta sala.",
            );
        }

        const projected = projectRoomWithGame(room, currentGame);

        return {
            ...projected,
            host: room.host,
            playerCount: projected.players.length,
        };
    }

    async listRoomGames(
        roomId: string,
        hostId: string,
    ): Promise<GameHistoryItem[]> {
        const room = await this.roomRepository.findById(roomId);

        if (!room) {
            throw new RoomNotFoundError();
        }

        if (room.hostId !== hostId) {
            throw new RoomAccessDeniedError(
                "Você não tem permissão para consultar o histórico desta sala.",
            );
        }

        const games = await this.roomRepository.findGamesByRoomId(roomId);
        return games.map((game) => buildGameHistorySummary(game));
    }

    async getGameResults(
        roomId: string,
        gameId: string,
        hostId: string,
    ): Promise<GameResultsDetails> {
        const room = await this.roomRepository.findById(roomId);

        if (!room) {
            throw new RoomNotFoundError();
        }

        if (room.hostId !== hostId) {
            throw new RoomAccessDeniedError(
                "Você não tem permissão para consultar os resultados desta sala.",
            );
        }

        const game = await this.roomRepository.findGameResultsById(
            roomId,
            gameId,
        );

        if (!game) {
            throw new RoomGameNotFoundError();
        }

        const summary = buildGameHistorySummary(game);

        const roundsBySnapshotQuestionId = new Map(
            game.rounds.map((round) => [round.snapshotQuestionId, round]),
        );

        const questions: GameQuestionResultItem[] =
            game.rounds.length > 0
                ? game.rounds.map((round) => {
                      const answeredCount = round.answers.length;
                      const correctCount = round.answers.filter(
                          (answer) => answer.isCorrect,
                      ).length;

                      return {
                          questionId: round.snapshotQuestion.id,
                          statement: round.snapshotQuestion.statement,
                          position: round.snapshotQuestion.position,
                          roundNumber: round.roundNumber,
                          roundStatus: round.status,
                          answeredCount,
                          correctCount,
                          correctRate:
                              answeredCount > 0
                                  ? correctCount / answeredCount
                                  : 0,
                      };
                  })
                : (game.questionSnapshot?.questions ?? []).map((sq, index) => {
                      const matchedRound = roundsBySnapshotQuestionId.get(
                          sq.id,
                      );
                      return {
                          questionId: sq.id,
                          statement: sq.statement,
                          position: sq.position,
                          roundNumber: matchedRound?.roundNumber ?? index + 1,
                          roundStatus: matchedRound?.status ?? "CLOSED",
                          answeredCount: 0,
                          correctCount: 0,
                          correctRate: 0,
                      };
                  });

        return {
            ...summary,
            questionCount: questions.length,
            questions,
        };
    }

}
