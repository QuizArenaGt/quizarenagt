
import type {
    Game,
    GameMode,
    GamePlayer,
    GamePlayerStatus,
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
import {
    countActiveGamePlayers,
    filterActiveGamePlayers,
    isGamePlayerActive,
} from "./game-player-eligibility.js";
import { getPlayerPresenceRegistry } from "../realtime/room-events.js";
import { JwtService } from "../auth/jwt.service.js";
import {
    resolvePlayerAvatarId,
    type PlayerAvatarId,
} from "./player-avatar.js";


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
    "createIfRoomHasCapacity" | "findBySessionTokenHash" | "leaveRoom"
>;

import type { CancelledGameSummary } from "./game-cancellation.js";

export type LeaveRoomResultSummary = {
    roomId: string;
    gameId: string;
    gameStatus: "WAITING" | "IN_PROGRESS";
    player: {
        id: string;
        nickname: string;
        status: GamePlayerStatus;
        score: number;
    };
    eligiblePlayerCount: number;
    openRoundId: string | null;
    cancelledGame?: CancelledGameSummary | null;
};

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
    player: Omit<
        GamePlayer,
        "sessionTokenHash" | "disconnectedAt" | "reconnectDeadlineAt"
    > & { roomId: string };
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
        avatarId: PlayerAvatarId;
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
    avatarId?: string | null;
    status?: GamePlayerStatus;
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
            avatarId?: string | null;
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
        avatarId: PlayerAvatarId;
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
    activeQuestionsCount?: number;
    finishedGamesCount?: number;
    totalGamesCount?: number;
    lastGameFinishedAt?: Date | null;
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
    avatarId: PlayerAvatarId;
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
    answeredCount: number;
    correctCount: number;
    averageCorrectRate: number | null;
    winner: {
        id: string;
        nickname: string;
        avatarId: PlayerAvatarId;
        score: number;
    } | null;
    ranking: GameRankingEntry[];
};

export type RoomAggregatedQuestionPerformance = {
    questionKey: string;
    questionId: string;
    sourceQuestionId: string | null;
    statement: string;
    position: number;
    gamesPlayedCount: number;
    answeredCount: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    expectedAnswers: number;
    correctRate: number | null;
    errorRate: number | null;
    overallCorrectRate: number | null;
};

export type RoomAggregatedStats = {
    roomId: string;
    finishedGamesCount: number;
    totalParticipations: number;
    averagePlayersPerGame: number | null;
    averageScore: number | null;
    totalAnswers: number;
    totalCorrectAnswers: number;
    totalWrongAnswers: number;
    averageCorrectRate: number | null;
    lastFinishedGameAt: Date | null;
    hardestQuestions: RoomAggregatedQuestionPerformance[];
    easiestQuestions: RoomAggregatedQuestionPerformance[];
    questionPerformance: RoomAggregatedQuestionPerformance[];
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
        avatarId?: string | null;
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
            avatarId: resolvePlayerAvatarId(player.avatarId),
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
                  avatarId: ranking[0].avatarId,
                  score: ranking[0].score,
              }
            : null;

    const totalAnswers = ranking.reduce((sum, entry) => sum + entry.answeredCount, 0);
    const totalCorrect = ranking.reduce((sum, entry) => sum + entry.correctCount, 0);

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
        answeredCount: totalAnswers,
        correctCount: totalCorrect,
        averageCorrectRate: totalAnswers > 0 ? totalCorrect / totalAnswers : null,
        winner,
        ranking,
    };
}

export type AggregatableGameRecord = {
    id: string;
    status: GameStatus;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    players: {
        id: string;
        score: number;
    }[];
    rounds: {
        id: string;
        snapshotQuestion?: {
            id: string;
            sourceQuestionId: string | null;
            statement: string;
            position: number;
        } | null;
        answers: {
            gamePlayerId: string;
            isCorrect: boolean;
        }[];
    }[];
};

export function buildRoomAggregatedStats(
    roomId: string,
    games: readonly AggregatableGameRecord[],
): RoomAggregatedStats {
    const finishedGames = games
        .filter((game) => game.status === "FINISHED")
        .sort(
            (a, b) =>
                a.createdAt.getTime() - b.createdAt.getTime() ||
                a.id.localeCompare(b.id),
        );

    if (finishedGames.length === 0) {
        return {
            roomId,
            finishedGamesCount: 0,
            totalParticipations: 0,
            averagePlayersPerGame: null,
            averageScore: null,
            totalAnswers: 0,
            totalCorrectAnswers: 0,
            totalWrongAnswers: 0,
            averageCorrectRate: null,
            lastFinishedGameAt: null,
            hardestQuestions: [],
            easiestQuestions: [],
            questionPerformance: [],
        };
    }

    let totalParticipations = 0;
    let totalScoreSum = 0;
    let totalAnswers = 0;
    let totalCorrectAnswers = 0;
    let lastFinishedGameAt: Date | null = null;

    const questionBuckets = new Map<
        string,
        {
            questionKey: string;
            questionId: string;
            sourceQuestionId: string | null;
            statement: string;
            position: number;
            gameIds: Set<string>;
            answeredCount: number;
            correctCount: number;
            expectedAnswers: number;
        }
    >();

    for (const game of finishedGames) {
        const participantCount = game.players.length;
        totalParticipations += participantCount;

        for (const player of game.players) {
            totalScoreSum += player.score;
        }

        const completionRef =
            game.finishedAt ?? game.startedAt ?? game.createdAt;
        if (
            lastFinishedGameAt === null ||
            completionRef.getTime() > lastFinishedGameAt.getTime()
        ) {
            lastFinishedGameAt = completionRef;
        }

        for (const round of game.rounds) {
            const answeredCount = round.answers.length;
            const correctCount = round.answers.filter(
                (answer) => answer.isCorrect,
            ).length;

            totalAnswers += answeredCount;
            totalCorrectAnswers += correctCount;

            if (!round.snapshotQuestion) {
                continue;
            }

            const sq = round.snapshotQuestion;
            const normalizedStatement = sq.statement.trim().toLowerCase();
            const questionKey = sq.sourceQuestionId
                ? `source:${sq.sourceQuestionId}`
                : `snapshot-stmt:${normalizedStatement}`;

            const existing = questionBuckets.get(questionKey);
            if (!existing) {
                questionBuckets.set(questionKey, {
                    questionKey,
                    questionId: sq.id,
                    sourceQuestionId: sq.sourceQuestionId,
                    statement: sq.statement,
                    position: sq.position,
                    gameIds: new Set([game.id]),
                    answeredCount,
                    correctCount,
                    expectedAnswers: participantCount,
                });
            } else {
                existing.statement = sq.statement;
                existing.questionId = sq.id;
                existing.gameIds.add(game.id);
                existing.answeredCount += answeredCount;
                existing.correctCount += correctCount;
                existing.expectedAnswers += participantCount;
            }
        }
    }

    const questionPerformance: RoomAggregatedQuestionPerformance[] = Array.from(
        questionBuckets.values(),
    )
        .map((bucket) => {
            const incorrectCount = Math.max(
                0,
                bucket.answeredCount - bucket.correctCount,
            );
            const unansweredCount = Math.max(
                0,
                bucket.expectedAnswers - bucket.answeredCount,
            );

            return {
                questionKey: bucket.questionKey,
                questionId: bucket.questionId,
                sourceQuestionId: bucket.sourceQuestionId,
                statement: bucket.statement,
                position: bucket.position,
                gamesPlayedCount: bucket.gameIds.size,
                answeredCount: bucket.answeredCount,
                correctCount: bucket.correctCount,
                incorrectCount,
                unansweredCount,
                expectedAnswers: bucket.expectedAnswers,
                correctRate:
                    bucket.answeredCount > 0
                        ? bucket.correctCount / bucket.answeredCount
                        : null,
                errorRate:
                    bucket.answeredCount > 0
                        ? incorrectCount / bucket.answeredCount
                        : null,
                overallCorrectRate:
                    bucket.expectedAnswers > 0
                        ? bucket.correctCount / bucket.expectedAnswers
                        : null,
            };
        })
        .sort(
            (a, b) =>
                b.answeredCount - a.answeredCount ||
                a.position - b.position ||
                a.statement.localeCompare(b.statement),
        );

    const answeredQuestions = questionPerformance.filter(
        (item) => item.answeredCount > 0 && item.correctRate !== null,
    );

    const hardestQuestions = answeredQuestions
        .filter((item) => item.incorrectCount > 0)
        .sort(
            (a, b) =>
                (b.errorRate ?? 0) - (a.errorRate ?? 0) ||
                b.incorrectCount - a.incorrectCount ||
                b.answeredCount - a.answeredCount,
        );

    // Exige amostra mínima de 2 respostas para evitar classificar questões sem amostra ou com 1 único acerto isolado como melhor desempenho.
    const MIN_ANSWERS_FOR_TOP_PERFORMANCE = 2;
    const easiestQuestions = answeredQuestions
        .filter(
            (item) =>
                item.answeredCount >= MIN_ANSWERS_FOR_TOP_PERFORMANCE &&
                item.correctCount > 0,
        )
        .sort(
            (a, b) =>
                (b.correctRate ?? 0) - (a.correctRate ?? 0) ||
                b.correctCount - a.correctCount ||
                b.answeredCount - a.answeredCount,
        );

    const finishedGamesCount = finishedGames.length;
    const totalWrongAnswers = Math.max(0, totalAnswers - totalCorrectAnswers);

    return {
        roomId,
        finishedGamesCount,
        totalParticipations,
        averagePlayersPerGame: totalParticipations / finishedGamesCount,
        averageScore:
            totalParticipations > 0 ? totalScoreSum / totalParticipations : null,
        totalAnswers,
        totalCorrectAnswers,
        totalWrongAnswers,
        averageCorrectRate:
            totalAnswers > 0 ? totalCorrectAnswers / totalAnswers : null,
        lastFinishedGameAt,
        hardestQuestions,
        easiestQuestions,
        questionPerformance,
    };
}

function projectRoomWithGame(
    room: Room & {
        games?: readonly GameWithPlayersProjection[];
        questions?: readonly { id: string }[];
    },
    explicitGame?: GameWithPlayersProjection | null,
): ProjectedRoomSummary {
    const selectedGame =
        explicitGame ??
        (room.games ? selectCurrentGame(room.games) : null);

    const allPlayers = (selectedGame?.players ?? []).map((player) => ({
        ...player,
        avatarId: resolvePlayerAvatarId(player.avatarId),
    }));
    const activePlayers = filterActiveGamePlayers(allPlayers);
    const exposedPlayers =
        selectedGame?.status === "WAITING" ? activePlayers : allPlayers;
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
              eligiblePlayerCount: activePlayers.length,
              answeredPlayers: openRound.answers.map((answer) => ({
                  id: answer.gamePlayer.id,
                  nickname: answer.gamePlayer.nickname,
                  avatarId: resolvePlayerAvatarId(answer.gamePlayer.avatarId),
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
            ? buildRoundClosedPayload(latestClosedRound, allPlayers).round
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
              playerCount: exposedPlayers.length,
              eligiblePlayerCount: activePlayers.length,
              totalQuestions:
                  selectedGame.questionSnapshot?._count?.questions ?? 0,
              completedRoundsCount: completedRounds.length,
              completedRounds,
              activeRound,
              lastClosedRound,
              players: exposedPlayers,
          }
        : null;

    const hasActiveGame =
        selectedGame !== null &&
        (selectedGame.status === "WAITING" ||
            selectedGame.status === "IN_PROGRESS");

    const finishedGames = (room.games ?? []).filter(
        (game) => game.status === "FINISHED",
    );
    let lastGameFinishedAt: Date | null = null;
    for (const game of finishedGames) {
        const refDate = game.finishedAt ?? game.startedAt ?? game.createdAt;
        if (
            lastGameFinishedAt === null ||
            refDate.getTime() > lastGameFinishedAt.getTime()
        ) {
            lastGameFinishedAt = refDate;
        }
    }

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
        players: exposedPlayers,
        currentGame,
        ...(room.questions !== undefined
            ? { activeQuestionsCount: room.questions.length }
            : {}),
        ...(room.games !== undefined
            ? {
                  finishedGamesCount: finishedGames.length,
                  totalGamesCount: room.games.length,
                  lastGameFinishedAt,
              }
            : {}),
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
            (target.includes("gameId") && target.includes("nickname")) ||
            target.some((item) => String(item).includes("nickname"))
        );
    }

    if (typeof target === "string") {
        return (
            (target.includes("gameId") && target.includes("nickname")) ||
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

        const activeWaitingPlayerCount = waitingGame
            ? countActiveGamePlayers(waitingGame.players)
            : 0;

        if (
            waitingGame &&
            validation.data.maxPlayers !== undefined &&
            validation.data.maxPlayers < activeWaitingPlayerCount
        ) {
            throw new InvalidRoomDataError("Dados da sala inválidos.", {
                maxPlayers: `A quantidade máxima não pode ser menor que os ${activeWaitingPlayerCount} jogadores já presentes no lobby.`,
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
            case "START_REQUIREMENTS_NOT_MET":
                throw new RoomStartRequirementsError(
                    result.reason,
                    result.details,
                );
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
                avatarId: resolvePlayerAvatarId(player.avatarId),
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

        const { code, nickname, avatarId } = validation.data;

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
                    avatarId,
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
            avatarId: resolvePlayerAvatarId(createdPlayer.avatarId),
            status: createdPlayer.status,
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

        if (countActiveGamePlayers(currentGame.players) >= currentGame.maxPlayers) {
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

        if (!player || !player.game || !isGamePlayerActive(player)) {
            throw new RoomAuthenticationError();
        }

        if (
            player.reconnectDeadlineAt &&
            player.reconnectDeadlineAt.getTime() <= Date.now() &&
            (getPlayerPresenceRegistry()?.getActiveSocketCount(player.id) ?? 0) === 0
        ) {
            throw new RoomAuthenticationError("Prazo de reconexão expirado.");
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
        const { games } = await this.listRoomGamesWithStats(roomId, hostId);
        return games;
    }

    async listRoomGamesWithStats(
        roomId: string,
        hostId: string,
    ): Promise<{ games: GameHistoryItem[]; stats: RoomAggregatedStats }> {
        const room = await this.roomRepository.findById(roomId);

        if (!room) {
            throw new RoomNotFoundError();
        }

        if (room.hostId !== hostId) {
            throw new RoomAccessDeniedError(
                "Você não tem permissão para consultar o histórico desta sala.",
            );
        }

        const rawGames = await this.roomRepository.findGamesByRoomId(roomId);
        return {
            games: rawGames.map((game) => buildGameHistorySummary(game)),
            stats: buildRoomAggregatedStats(roomId, rawGames),
        };
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

    async leaveRoom(
        gamePlayerId: string,
        roomId: string,
    ): Promise<LeaveRoomResultSummary> {
        const result = await this.roomPlayerRepository.leaveRoom(
            gamePlayerId,
            roomId,
        );

        if (result.success) {
            return {
                roomId: result.roomId,
                gameId: result.gameId,
                gameStatus: result.gameStatus,
                player: result.player,
                eligiblePlayerCount: result.eligiblePlayerCount,
                openRoundId: result.openRoundId,
                cancelledGame: result.cancelledGame ?? null,
            };
        }

        switch (result.reason) {
            case "ROOM_NOT_FOUND":
                throw new RoomNotFoundError();

            case "PLAYER_NOT_ACTIVE":
                throw new RoomAuthenticationError(
                    "Sessão de participante inválida.",
                );

            case "ROOM_ARCHIVED":
            case "GAME_NOT_FOUND":
            case "GAME_NOT_LEAVABLE":
                throw new RoomNotEditableError(
                    "Não é possível sair desta partida no estado atual.",
                );
        }
    }

}
