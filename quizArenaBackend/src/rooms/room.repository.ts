
import type {
    Room,
    Game,
    GameMode,
    GameStatus,
    Prisma,
    QuestionType,
    RoundStatus,
} from "@prisma/client";

import { prisma } from "../database/prisma.js";

type CreateRoomQuestionData = {
    statement: string;
    type: QuestionType;
    options: {
        text: string;
        isCorrect: boolean;
    }[];
};

type CreateRoomData = {
    code: string;
    name?: string | null;
    theme?: string | null;
    hostId: string;
    maxPlayers: number;
    questionTime: number;
    gameMode?: GameMode;
    questions?: CreateRoomQuestionData[];
};

type UpdateRoomData = {
    name?: string | null;
    theme?: string | null;
    maxPlayers?: number;
    questionTime?: number;
    gameMode?: GameMode;
};

import type { RoomStartRequirementsDetails } from "./room.errors.js";

export type StartRoomResult =
    | {
        success: true;
        room: Room;
        game: Game;
    }
    | {
        success: false;
        reason:
        | "ROOM_NOT_FOUND"
        | "ACCESS_DENIED"
        | "ROOM_NOT_WAITING";
    }
    | {
        success: false;
        reason:
        | "NOT_ENOUGH_PLAYERS"
        | "NOT_ENOUGH_QUESTIONS"
        | "START_REQUIREMENTS_NOT_MET";
        details: RoomStartRequirementsDetails;
    };

export type CreateNextGameResult =
    | {
        success: true;
        room: Room;
        game: Game;
    }
    | {
        success: false;
        reason:
        | "ROOM_NOT_FOUND"
        | "ACCESS_DENIED"
        | "ROOM_ARCHIVED"
        | "ACTIVE_GAME_EXISTS";
    };

export type ArchiveRoomResult =
    | {
        success: true;
        room: Room & {
            games: (Game & {
                players: {
                    id: string;
                    nickname: string;
                    score: number;
                    joinedAt: Date;
                }[];
            })[];
        };
        alreadyArchived: boolean;
    }
    | {
        success: false;
        reason: "ROOM_NOT_FOUND" | "ACCESS_DENIED";
    };

export type FinishGameClosedRound = {
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
        options: {
            id: string;
            text: string;
            isCorrect: boolean;
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
        };
    }[];
};

export type FinishGameResult =
    | {
        success: true;
        room: Room & {
            games: (Game & {
                players: {
                    id: string;
                    nickname: string;
                    score: number;
                    joinedAt: Date;
                }[];
            })[];
        };
        game: Game;
        closedRound: FinishGameClosedRound | null;
        players: {
            id: string;
            nickname: string;
            score: number;
            joinedAt: Date;
        }[];
        alreadyFinished: boolean;
    }
    | {
        success: false;
        reason:
        | "ROOM_NOT_FOUND"
        | "ACCESS_DENIED"
        | "ROOM_ARCHIVED"
        | "GAME_NOT_FOUND"
        | "GAME_NOT_IN_PROGRESS";
    };

async function getTransactionNow(tx: {
    $queryRaw: Prisma.TransactionClient["$queryRaw"];
}): Promise<Date> {
    const rows = await tx.$queryRaw<{ now: Date }[]>`
        SELECT NOW() AS now
    `;

    if (Array.isArray(rows) && rows[0]?.now instanceof Date) {
        return rows[0].now;
    }

    return new Date();
}

export function selectCurrentGame<
    TGame extends { status: GameStatus },
>(games: readonly TGame[]): TGame | null {
    return (
        games.find(
            (game) =>
                game.status === "WAITING" || game.status === "IN_PROGRESS",
        ) ??
        games[0] ??
        null
    );
}

const gameLobbyInclude = {
    players: {
        select: {
            id: true,
            nickname: true,
            status: true,
            score: true,
            joinedAt: true,
        },
        orderBy: {
            joinedAt: "asc" as const,
        },
    },
    questionSnapshot: {
        select: {
            id: true,
            _count: {
                select: {
                    questions: true,
                },
            },
        },
    },
    rounds: {
        orderBy: {
            roundNumber: "desc" as const,
        },
        include: {
            snapshotQuestion: {
                include: {
                    options: {
                        orderBy: {
                            position: "asc" as const,
                        },
                    },
                },
            },
            answers: {
                include: {
                    gamePlayer: {
                        select: {
                            id: true,
                            nickname: true,
                        },
                    },
                    option: {
                        select: {
                            id: true,
                            text: true,
                            isCorrect: true,
                        },
                    },
                },
            },
        },
    },
};

export class RoomRepository {
    async findById(id: string): Promise<Room | null> {
        return prisma.room.findUnique({
            where: { id },
        });
    }

    async findByIdWithCurrentGame(id: string) {
        return prisma.room.findUnique({
            where: { id },
            include: {
                games: {
                    orderBy: [
                        { createdAt: "desc" },
                        { id: "desc" },
                    ],
                    include: {
                        players: {
                            select: {
                                id: true,
                                nickname: true,
                                status: true,
                                score: true,
                                joinedAt: true,
                            },
                            orderBy: {
                                joinedAt: "asc",
                            },
                        },
                    },
                },
            },
        });
    }

    async findByCode(code: string): Promise<Room | null> {
        return prisma.room.findUnique({
            where: { code },
        });
    }

    async findByCodeWithLobby(code: string) {
        return prisma.room.findUnique({
            where: { code },
            include: {
                host: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                games: {
                    orderBy: [
                        { createdAt: "desc" },
                        { id: "desc" },
                    ],
                    include: gameLobbyInclude,
                },
            },
        });
    }

    async findManyByHostId(hostId: string) {
        return prisma.room.findMany({
            where: {
                hostId,
                status: "ACTIVE",
            },
            orderBy: { createdAt: "desc" },
            include: {
                questions: {
                    where: { isActive: true },
                    select: { id: true },
                },
                games: {
                    orderBy: [
                        { createdAt: "desc" },
                        { id: "desc" },
                    ],
                    include: gameLobbyInclude,
                },
            },
        });
    }

    async create(data: CreateRoomData) {
        const { questions, ...roomData } = data;

        return prisma.$transaction(async (tx) => {
            return tx.room.create({
                data: {
                    ...roomData,
                    status: "ACTIVE",
                    ...(questions && {
                        questions: {
                            create: questions.map((question) => ({
                                statement: question.statement,
                                type: question.type,
                                options: {
                                    create: question.options.map(
                                        (option, position) => ({
                                            text: option.text,
                                            isCorrect: option.isCorrect,
                                            position,
                                        }),
                                    ),
                                },
                            })),
                        },
                    }),
                    games: {
                        create: {
                            status: "WAITING",
                            maxPlayers: roomData.maxPlayers,
                            questionTime: roomData.questionTime,
                            gameMode: roomData.gameMode ?? "CLASSIC",
                            startedAt: null,
                            finishedAt: null,
                        },
                    },
                },
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                        include: {
                            players: {
                                select: {
                                    id: true,
                                    nickname: true,
                                    status: true,
                                    score: true,
                                    joinedAt: true,
                                },
                                orderBy: {
                                    joinedAt: "asc",
                                },
                            },
                        },
                    },
                },
            });
        });
    }

    async update(
        id: string,
        data: UpdateRoomData,
        waitingGameId?: string | null,
    ) {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${id}
                FOR UPDATE
            `;

            if (
                waitingGameId &&
                (data.maxPlayers !== undefined ||
                    data.questionTime !== undefined ||
                    data.gameMode !== undefined)
            ) {
                await tx.game.update({
                    where: { id: waitingGameId },
                    data: {
                        ...(data.maxPlayers !== undefined && {
                            maxPlayers: data.maxPlayers,
                        }),
                        ...(data.questionTime !== undefined && {
                            questionTime: data.questionTime,
                        }),
                        ...(data.gameMode !== undefined && {
                            gameMode: data.gameMode,
                        }),
                    },
                });
            }

            return tx.room.update({
                where: { id },
                data,
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                        include: {
                            players: {
                                select: {
                                    id: true,
                                    nickname: true,
                                    status: true,
                                    score: true,
                                    joinedAt: true,
                                },
                                orderBy: {
                                    joinedAt: "asc",
                                },
                            },
                        },
                    },
                },
            });
        });
    }

    async startIfReady(
        roomId: string,
        hostId: string,
    ): Promise<StartRoomResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${roomId}
                FOR UPDATE
            `;

            const room = await tx.room.findUnique({
                where: { id: roomId },
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                    },
                },
            });

            if (!room) {
                return {
                    success: false,
                    reason: "ROOM_NOT_FOUND",
                };
            }

            if (room.hostId !== hostId) {
                return {
                    success: false,
                    reason: "ACCESS_DENIED",
                };
            }

            const currentGame = selectCurrentGame(room.games);

            if (
                room.status !== "ACTIVE" ||
                !currentGame ||
                currentGame.status !== "WAITING"
            ) {
                return {
                    success: false,
                    reason: "ROOM_NOT_WAITING",
                };
            }

            const playerCount = await tx.gamePlayer.count({
                where: {
                    gameId: currentGame.id,
                    status: "ACTIVE",
                },
            });

            const questions = await tx.question.findMany({
                where: {
                    roomId,
                    isActive: true,
                },
                orderBy: [
                    { createdAt: "asc" },
                    { id: "asc" },
                ],
                include: {
                    options: {
                        orderBy: { position: "asc" },
                    },
                },
            });

            const missingPlayers = playerCount < 2;
            const missingQuestions = questions.length < 5;

            if (missingPlayers || missingQuestions) {
                const details: RoomStartRequirementsDetails = {
                    currentPlayers: playerCount,
                    requiredPlayers: 2,
                    currentQuestions: questions.length,
                    requiredQuestions: 5,
                    missingPlayers,
                    missingQuestions,
                };

                const reason =
                    missingPlayers && missingQuestions
                        ? "START_REQUIREMENTS_NOT_MET"
                        : missingPlayers
                          ? "NOT_ENOUGH_PLAYERS"
                          : "NOT_ENOUGH_QUESTIONS";

                return {
                    success: false,
                    reason,
                    details,
                };
            }

            await tx.roomQuestionSnapshot.create({
                data: {
                    gameId: currentGame.id,
                    questions: {
                        create: questions.map((question, position) => ({
                            sourceQuestionId: question.id,
                            statement: question.statement,
                            type: question.type,
                            position,
                            options: {
                                create: question.options.map(
                                    (option, optionPosition) => ({
                                        sourceOptionId: option.id,
                                        text: option.text,
                                        isCorrect: option.isCorrect,
                                        position: optionPosition,
                                    }),
                                ),
                            },
                        })),
                    },
                },
            });

            const updatedGame = await tx.game.update({
                where: { id: currentGame.id },
                data: {
                    status: "IN_PROGRESS",
                    startedAt: new Date(),
                },
            });

            return {
                success: true,
                room,
                game: updatedGame,
            };
        });
    }

    async createNextGame(
        roomId: string,
        hostId: string,
    ): Promise<CreateNextGameResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${roomId}
                FOR UPDATE
            `;

            const room = await tx.room.findUnique({
                where: { id: roomId },
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                    },
                },
            });

            if (!room) {
                return {
                    success: false,
                    reason: "ROOM_NOT_FOUND",
                };
            }

            if (room.hostId !== hostId) {
                return {
                    success: false,
                    reason: "ACCESS_DENIED",
                };
            }

            if (room.status !== "ACTIVE") {
                return {
                    success: false,
                    reason: "ROOM_ARCHIVED",
                };
            }

            const hasActiveGame = room.games.some(
                (game) =>
                    game.status === "WAITING" ||
                    game.status === "IN_PROGRESS",
            );

            if (hasActiveGame) {
                return {
                    success: false,
                    reason: "ACTIVE_GAME_EXISTS",
                };
            }

            const game = await tx.game.create({
                data: {
                    roomId: room.id,
                    status: "WAITING",
                    maxPlayers: room.maxPlayers,
                    questionTime: room.questionTime,
                    gameMode: room.gameMode,
                    startedAt: null,
                    finishedAt: null,
                },
            });

            return {
                success: true,
                room,
                game,
            };
        });
    }

    async archiveByHost(
        roomId: string,
        hostId: string,
    ): Promise<ArchiveRoomResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${roomId}
                FOR UPDATE
            `;

            const existingRoom = await tx.room.findUnique({
                where: { id: roomId },
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                        include: {
                            players: {
                                select: {
                                    id: true,
                                    nickname: true,
                                    status: true,
                                    score: true,
                                    joinedAt: true,
                                },
                                orderBy: {
                                    joinedAt: "asc",
                                },
                            },
                        },
                    },
                },
            });

            if (!existingRoom) {
                return {
                    success: false,
                    reason: "ROOM_NOT_FOUND",
                };
            }

            if (existingRoom.hostId !== hostId) {
                return {
                    success: false,
                    reason: "ACCESS_DENIED",
                };
            }

            // Idempotência: mantém archivedAt original e preserva todos os vínculos.
            if (existingRoom.status === "ARCHIVED") {
                return {
                    success: true,
                    room: existingRoom,
                    alreadyArchived: true,
                };
            }

            const updatedRoom = await tx.room.update({
                where: { id: roomId },
                data: {
                    status: "ARCHIVED",
                    archivedAt: new Date(),
                },
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                        include: {
                            players: {
                                select: {
                                    id: true,
                                    nickname: true,
                                    status: true,
                                    score: true,
                                    joinedAt: true,
                                },
                                orderBy: {
                                    joinedAt: "asc",
                                },
                            },
                        },
                    },
                },
            });

            return {
                success: true,
                room: updatedRoom,
                alreadyArchived: false,
            };
        });
    }

    async finishActiveGame(
        roomId: string,
        hostId: string,
    ): Promise<FinishGameResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${roomId}
                FOR UPDATE
            `;

            const room = await tx.room.findUnique({
                where: { id: roomId },
                include: {
                    games: {
                        orderBy: [
                            { createdAt: "desc" },
                            { id: "desc" },
                        ],
                        include: {
                            players: {
                                select: {
                                    id: true,
                                    nickname: true,
                                    score: true,
                                    joinedAt: true,
                                },
                                orderBy: [
                                    { score: "desc" },
                                    { joinedAt: "asc" },
                                    { id: "asc" },
                                ],
                            },
                        },
                    },
                },
            });

            if (!room) {
                return {
                    success: false,
                    reason: "ROOM_NOT_FOUND",
                };
            }

            if (room.hostId !== hostId) {
                return {
                    success: false,
                    reason: "ACCESS_DENIED",
                };
            }

            if (room.status !== "ACTIVE") {
                return {
                    success: false,
                    reason: "ROOM_ARCHIVED",
                };
            }

            const currentGame = selectCurrentGame(room.games);

            if (!currentGame) {
                return {
                    success: false,
                    reason: "GAME_NOT_FOUND",
                };
            }

            if (currentGame.status === "FINISHED") {
                return {
                    success: true,
                    room,
                    game: currentGame,
                    closedRound: null,
                    players: currentGame.players,
                    alreadyFinished: true,
                };
            }

            if (currentGame.status !== "IN_PROGRESS") {
                return {
                    success: false,
                    reason: "GAME_NOT_IN_PROGRESS",
                };
            }

            // Mantém ordem de lock rooms -> rounds para evitar corrida com envio de respostas e worker.
            const openRounds = await tx.$queryRaw<{ id: string }[]>`
                SELECT id
                FROM rounds
                WHERE "gameId" = ${currentGame.id}
                  AND status = 'OPEN'
                ORDER BY "roundNumber" ASC
                FOR UPDATE
            `;

            const now = await getTransactionNow(tx);
            let closedRound: FinishGameClosedRound | null = null;

            for (const openRound of openRounds) {
                closedRound = (await tx.round.update({
                    where: { id: openRound.id },
                    data: {
                        status: "CLOSED",
                        closedAt: now,
                    },
                    include: {
                        snapshotQuestion: {
                            include: {
                                options: {
                                    orderBy: { position: "asc" },
                                },
                            },
                        },
                        answers: {
                            include: {
                                gamePlayer: {
                                    select: {
                                        id: true,
                                        nickname: true,
                                    },
                                },
                                option: {
                                    select: {
                                        id: true,
                                        text: true,
                                    },
                                },
                            },
                        },
                    },
                })) as FinishGameClosedRound;
            }

            const finishedGame = await tx.game.update({
                where: { id: currentGame.id },
                data: {
                    status: "FINISHED",
                    finishedAt: now,
                },
            });

            // Reconsulta jogadores após travar/fechar rodadas abertas para refletir todas as respostas comitadas.
            const players = await tx.gamePlayer.findMany({
                where: { gameId: currentGame.id },
                select: {
                    id: true,
                    nickname: true,
                    status: true,
                    score: true,
                    joinedAt: true,
                },
                orderBy: [
                    { score: "desc" },
                    { joinedAt: "asc" },
                    { id: "asc" },
                ],
            });

            const updatedRoom = {
                ...room,
                games: room.games.map((g) =>
                    g.id === finishedGame.id
                        ? { ...g, ...finishedGame, players }
                        : g,
                ),
            };

            return {
                success: true,
                room: updatedRoom,
                game: finishedGame,
                closedRound,
                players,
                alreadyFinished: false,
            };
        });
    }

    async findGamesByRoomId(roomId: string) {
        return prisma.game.findMany({
            where: { roomId },
            orderBy: [
                { createdAt: "desc" },
                { id: "desc" },
            ],
            include: {
                players: {
                    select: {
                        id: true,
                        nickname: true,
                        score: true,
                        joinedAt: true,
                    },
                    orderBy: [
                        { score: "desc" },
                        { joinedAt: "asc" },
                        { id: "asc" },
                    ],
                },
                rounds: {
                    orderBy: { roundNumber: "asc" },
                    select: {
                        id: true,
                        status: true,
                        snapshotQuestion: {
                            select: {
                                id: true,
                                sourceQuestionId: true,
                                statement: true,
                                position: true,
                            },
                        },
                        answers: {
                            select: {
                                gamePlayerId: true,
                                isCorrect: true,
                            },
                        },
                    },
                },
            },
        });
    }

    async findGameResultsById(roomId: string, gameId: string) {
        return prisma.game.findFirst({
            where: {
                id: gameId,
                roomId,
            },
            include: {
                players: {
                    select: {
                        id: true,
                        nickname: true,
                        score: true,
                        joinedAt: true,
                    },
                    orderBy: [
                        { score: "desc" },
                        { joinedAt: "asc" },
                        { id: "asc" },
                    ],
                },
                questionSnapshot: {
                    include: {
                        questions: {
                            orderBy: { position: "asc" },
                        },
                    },
                },
                rounds: {
                    orderBy: { roundNumber: "asc" },
                    include: {
                        snapshotQuestion: {
                            select: {
                                id: true,
                                statement: true,
                                position: true,
                            },
                        },
                        answers: {
                            select: {
                                id: true,
                                gamePlayerId: true,
                                isCorrect: true,
                                points: true,
                            },
                        },
                    },
                },
            },
        });
    }
}
