import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoomService } from "../../src/rooms/room.service.js";
import {
    DuplicateNicknameError,
    InvalidRoomDataError,
    RoomAccessDeniedError,
    RoomAuthenticationError,
    RoomFullError,
    RoomNotEditableError,
    RoomNotFoundError,
    RoomNotJoinableError,
    RoomReplayNotAllowedError,
    RoomStartRequirementsError,
} from "../../src/rooms/room.errors.js";

describe("RoomService", () => {
    const baseDate = new Date("2026-11-18T12:00:00.000Z");

    const baseGameFixture = {
        id: "game-test-uuid",
        roomId: "room-test-uuid",
        status: "WAITING" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        startedAt: null,
        finishedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        players: [],
    };

    const roomFixture = {
        id: "room-test-uuid",
        code: "ABC123",
        name: "Sala Principal",
        theme: "História",
        hostId: "user-host-uuid",
        status: "ACTIVE" as const,
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        archivedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        games: [baseGameFixture],
    };

    let roomRepositoryMock: {
        create: ReturnType<typeof vi.fn>;
        findById: ReturnType<typeof vi.fn>;
        findByIdWithCurrentGame: ReturnType<typeof vi.fn>;
        findByCode: ReturnType<typeof vi.fn>;
        findByCodeWithLobby: ReturnType<typeof vi.fn>;
        findManyByHostId: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        startIfReady: ReturnType<typeof vi.fn>;
        createNextGame: ReturnType<typeof vi.fn>;
        archiveByHost: ReturnType<typeof vi.fn>;
        finishActiveGame: ReturnType<typeof vi.fn>;
        findGamesByRoomId: ReturnType<typeof vi.fn>;
        findGameResultsById: ReturnType<typeof vi.fn>;
    };

    let codeGeneratorMock: {
        generate: ReturnType<typeof vi.fn>;
    };

    let roomPlayerRepositoryMock: {
        createIfRoomHasCapacity: ReturnType<typeof vi.fn>;
        findBySessionTokenHash: ReturnType<typeof vi.fn>;
        leaveRoom: ReturnType<typeof vi.fn>;
    };

    let jwtServiceMock: {
        verify: ReturnType<typeof vi.fn>;
    };

    let service: RoomService;

    beforeEach(() => {
        roomRepositoryMock = {
            create: vi.fn(),
            findById: vi.fn(),
            findByIdWithCurrentGame: vi.fn(),
            findByCode: vi.fn(),
            findByCodeWithLobby: vi.fn(),
            findManyByHostId: vi.fn(),
            update: vi.fn(),
            startIfReady: vi.fn(),
            createNextGame: vi.fn(),
            archiveByHost: vi.fn(),
            finishActiveGame: vi.fn(),
            findGamesByRoomId: vi.fn(),
            findGameResultsById: vi.fn(),
        };

        codeGeneratorMock = {
            generate: vi.fn(),
        };

        roomPlayerRepositoryMock = {
            createIfRoomHasCapacity: vi.fn(),
            findBySessionTokenHash: vi.fn(),
            leaveRoom: vi.fn(),
        };

        jwtServiceMock = {
            verify: vi.fn(),
        };

        service = new RoomService(
            roomRepositoryMock as never,
            codeGeneratorMock as never,
            roomPlayerRepositoryMock as never,
            jwtServiceMock as never,
        );
    });

    describe("createRoom", () => {
        it("deve criar uma sala ACTIVE com Game WAITING e projetar roomStatus/status/currentGame", async () => {
            codeGeneratorMock.generate.mockResolvedValue("ABC123");
            roomRepositoryMock.create.mockResolvedValue(roomFixture);

            const result = await service.createRoom({
                hostId: "user-host-uuid",
                name: "Sala Principal",
                theme: "História",
                maxPlayers: 10,
                questionTime: 30,
                gameMode: "CLASSIC",
            });

            expect(roomRepositoryMock.create).toHaveBeenCalledWith({
                code: "ABC123",
                name: "Sala Principal",
                theme: "História",
                hostId: "user-host-uuid",
                maxPlayers: 10,
                questionTime: 30,
                gameMode: "CLASSIC",
            });
            expect(result.roomStatus).toBe("ACTIVE");
            expect(result.status).toBe("WAITING");
            expect(result.currentGame).toEqual({
                id: "game-test-uuid",
                status: "WAITING",
                maxPlayers: 10,
                questionTime: 30,
                gameMode: "CLASSIC",
                startedAt: null,
                finishedAt: null,
                createdAt: baseDate,
                playerCount: 0,
                eligiblePlayerCount: 0,
                totalQuestions: 0,
                completedRoundsCount: 0,
                completedRounds: [],
                activeRound: null,
                lastClosedRound: null,
                players: [],
            });
        });

        it("deve rejeitar dados inválidos na criação da sala", async () => {
            await expect(
                service.createRoom({
                    hostId: "user-host-uuid",
                    maxPlayers: 1,
                    questionTime: 30,
                    gameMode: "CLASSIC",
                }),
            ).rejects.toThrow(InvalidRoomDataError);

            expect(codeGeneratorMock.generate).not.toHaveBeenCalled();
            expect(roomRepositoryMock.create).not.toHaveBeenCalled();
        });
    });

    describe("listHostRooms", () => {
        it("deve listar apenas as salas ativas do host com jogadores da partida atual", async () => {
            const player = {
                id: "p-1",
                nickname: "Alice",
                avatarId: "explorer",
                status: "ACTIVE" as const,
                score: 100,
                joinedAt: baseDate,
            };
            roomRepositoryMock.findManyByHostId.mockResolvedValue([
                {
                    ...roomFixture,
                    games: [{ ...baseGameFixture, players: [player] }],
                },
            ]);

            const result = await service.listHostRooms("user-host-uuid");

            expect(roomRepositoryMock.findManyByHostId).toHaveBeenCalledWith(
                "user-host-uuid",
            );
            expect(result).toHaveLength(1);
            expect(result[0]?.players).toEqual([player]);
            expect(result[0]?.roomStatus).toBe("ACTIVE");
            expect(result[0]?.status).toBe("WAITING");
        });

        it("deve garantir isolamento entre dois hosts distintos", async () => {
            roomRepositoryMock.findManyByHostId
                .mockResolvedValueOnce([roomFixture])
                .mockResolvedValueOnce([]);

            const host1Rooms = await service.listHostRooms("host-1");
            const host2Rooms = await service.listHostRooms("host-2");

            expect(host1Rooms).toHaveLength(1);
            expect(host2Rooms).toEqual([]);
        });
    });

    describe("updateRoom", () => {
        it("deve atualizar sala e sincronizar o Game em WAITING", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue(
                roomFixture,
            );
            roomRepositoryMock.update.mockResolvedValue({
                ...roomFixture,
                maxPlayers: 20,
                games: [{ ...baseGameFixture, maxPlayers: 20, players: [] }],
            });

            const result = await service.updateRoom({
                roomId: roomFixture.id,
                hostId: roomFixture.hostId,
                data: { maxPlayers: 20 },
            });

            expect(roomRepositoryMock.update).toHaveBeenCalledWith(
                roomFixture.id,
                { maxPlayers: 20 },
                baseGameFixture.id,
            );
            expect(result.maxPlayers).toBe(20);
        });

        it("deve permitir alterar padrões da sala após partida FINISHED sem alterar waitingGameId", async () => {
            const finishedGame = {
                ...baseGameFixture,
                status: "FINISHED" as const,
                finishedAt: baseDate,
            };
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue({
                ...roomFixture,
                games: [finishedGame],
            });
            roomRepositoryMock.update.mockResolvedValue({
                ...roomFixture,
                questionTime: 45,
                games: [finishedGame],
            });

            const result = await service.updateRoom({
                roomId: roomFixture.id,
                hostId: roomFixture.hostId,
                data: { questionTime: 45 },
            });

            expect(roomRepositoryMock.update).toHaveBeenCalledWith(
                roomFixture.id,
                { questionTime: 45 },
                null,
            );
            expect(result.questionTime).toBe(45);
            expect(result.currentGame?.questionTime).toBe(30);
        });

        it("deve rejeitar redução de maxPlayers abaixo dos jogadores já no lobby WAITING", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue({
                ...roomFixture,
                games: [
                    {
                        ...baseGameFixture,
                        players: [
                            { id: "p1", nickname: "A", status: "ACTIVE" as const, score: 0, joinedAt: baseDate },
                            { id: "p2", nickname: "B", status: "ACTIVE" as const, score: 0, joinedAt: baseDate },
                            { id: "p3", nickname: "C", status: "ACTIVE" as const, score: 0, joinedAt: baseDate },
                        ],
                    },
                ],
            });

            await expect(
                service.updateRoom({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    data: { maxPlayers: 2 },
                }),
            ).rejects.toThrow(InvalidRoomDataError);

            expect(roomRepositoryMock.update).not.toHaveBeenCalled();
        });

        it("deve rejeitar edição durante partida IN_PROGRESS", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue({
                ...roomFixture,
                games: [{ ...baseGameFixture, status: "IN_PROGRESS" }],
            });

            await expect(
                service.updateRoom({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    data: { maxPlayers: 12 },
                }),
            ).rejects.toThrow(RoomNotEditableError);
        });

        it("deve rejeitar edição de sala ARCHIVED", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue({
                ...roomFixture,
                status: "ARCHIVED",
            });

            await expect(
                service.updateRoom({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    data: { maxPlayers: 12 },
                }),
            ).rejects.toThrow(RoomNotEditableError);
        });

        it("deve rejeitar edição quando a sala não existir ou o usuário não for o host", async () => {
            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue(null);

            await expect(
                service.updateRoom({
                    roomId: roomFixture.id,
                    hostId: roomFixture.hostId,
                    data: { maxPlayers: 12 },
                }),
            ).rejects.toThrow(RoomNotFoundError);

            roomRepositoryMock.findByIdWithCurrentGame.mockResolvedValue(
                roomFixture,
            );

            await expect(
                service.updateRoom({
                    roomId: roomFixture.id,
                    hostId: "outro-host",
                    data: { maxPlayers: 12 },
                }),
            ).rejects.toThrow(RoomAccessDeniedError);
        });
    });

    describe("startRoom", () => {
        it("deve iniciar o Game atual e projetar status IN_PROGRESS", async () => {
            const startedGame = {
                ...baseGameFixture,
                status: "IN_PROGRESS" as const,
                startedAt: baseDate,
            };
            roomRepositoryMock.startIfReady.mockResolvedValue({
                success: true,
                room: roomFixture,
                game: startedGame,
            });

            const result = await service.startRoom(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(result.status).toBe("IN_PROGRESS");
            expect(result.roomStatus).toBe("ACTIVE");
            expect(result.currentGame?.id).toBe(startedGame.id);
        });

        it("deve converter motivos de falha do repositório em erros de domínio", async () => {
            roomRepositoryMock.startIfReady.mockResolvedValueOnce({
                success: false,
                reason: "ROOM_NOT_WAITING",
            });
            await expect(
                service.startRoom(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(RoomNotEditableError);

            roomRepositoryMock.startIfReady.mockResolvedValueOnce({
                success: false,
                reason: "NOT_ENOUGH_PLAYERS",
                details: {
                    currentPlayers: 1,
                    requiredPlayers: 2,
                    currentQuestions: 5,
                    requiredQuestions: 5,
                    missingPlayers: true,
                    missingQuestions: false,
                },
            });
            await expect(
                service.startRoom(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(RoomStartRequirementsError);

            roomRepositoryMock.startIfReady.mockResolvedValueOnce({
                success: false,
                reason: "START_REQUIREMENTS_NOT_MET",
                details: {
                    currentPlayers: 0,
                    requiredPlayers: 2,
                    currentQuestions: 2,
                    requiredQuestions: 5,
                    missingPlayers: true,
                    missingQuestions: true,
                },
            });
            await expect(
                service.startRoom(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(
                /2 jogadores ativos \(atual: 0\).*5 perguntas ativas \(atual: 2\)/,
            );
        });
    });

    describe("playAgain", () => {
        it("deve criar uma nova partida WAITING isolada após o término da anterior", async () => {
            const game2 = {
                ...baseGameFixture,
                id: "game-2-uuid",
                status: "WAITING" as const,
                players: [],
            };
            roomRepositoryMock.createNextGame.mockResolvedValue({
                success: true,
                room: roomFixture,
                game: game2,
            });

            const result = await service.playAgain(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(roomRepositoryMock.createNextGame).toHaveBeenCalledWith(
                roomFixture.id,
                roomFixture.hostId,
            );
            expect(result.status).toBe("WAITING");
            expect(result.currentGame?.id).toBe("game-2-uuid");
            expect(result.players).toEqual([]);
        });

        it("deve lançar RoomReplayNotAllowedError quando já existir partida ativa", async () => {
            roomRepositoryMock.createNextGame.mockResolvedValue({
                success: false,
                reason: "ACTIVE_GAME_EXISTS",
            });

            await expect(
                service.playAgain(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(RoomReplayNotAllowedError);
        });

        it("deve lançar RoomNotEditableError quando a sala estiver ARCHIVED", async () => {
            roomRepositoryMock.createNextGame.mockResolvedValue({
                success: false,
                reason: "ROOM_ARCHIVED",
            });

            await expect(
                service.playAgain(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(RoomNotEditableError);
        });
    });

    describe("joinRoom", () => {
        it("deve criar um GamePlayer na partida WAITING e ocultar sessionTokenHash", async () => {
            roomRepositoryMock.findByCode.mockResolvedValue(roomFixture);
            roomPlayerRepositoryMock.createIfRoomHasCapacity.mockResolvedValue({
                id: "player-uuid",
                gameId: baseGameFixture.id,
                roomId: roomFixture.id,
                userId: null,
                nickname: "Alice",
                avatarId: "explorer",
                status: "ACTIVE",
                sessionTokenHash: "secret-hash",
                score: 0,
                joinedAt: baseDate,
            });

            const result = await service.joinRoom({
                code: "ABC123",
                nickname: "Alice",
            });

            expect(result.sessionToken).toBeTypeOf("string");
            expect(result.player).toEqual({
                id: "player-uuid",
                gameId: baseGameFixture.id,
                roomId: roomFixture.id,
                userId: null,
                nickname: "Alice",
                avatarId: "explorer",
                status: "ACTIVE",
                score: 0,
                joinedAt: baseDate,
            });
            expect(result.player).not.toHaveProperty("sessionTokenHash");
        });

        it("deve rejeitar entrada em sala ARCHIVED", async () => {
            roomRepositoryMock.findByCode.mockResolvedValue({
                ...roomFixture,
                status: "ARCHIVED",
            });

            await expect(
                service.joinRoom({ code: "ABC123", nickname: "Alice" }),
            ).rejects.toThrow(RoomNotJoinableError);
        });

        it("deve converter violação P2002 de gameId+nickname em DuplicateNicknameError", async () => {
            roomRepositoryMock.findByCode.mockResolvedValue(roomFixture);
            const p2002Error = new Prisma.PrismaClientKnownRequestError(
                "Unique constraint failed",
                {
                    code: "P2002",
                    clientVersion: "6.19.3",
                    meta: { target: ["gameId", "nickname"] },
                },
            );
            roomPlayerRepositoryMock.createIfRoomHasCapacity.mockRejectedValue(
                p2002Error,
            );

            await expect(
                service.joinRoom({ code: "ABC123", nickname: "Alice" }),
            ).rejects.toThrow(DuplicateNicknameError);
        });

        it("deve mapear ROOM_FULL para RoomFullError", async () => {
            roomRepositoryMock.findByCode.mockResolvedValue(roomFixture);
            roomPlayerRepositoryMock.createIfRoomHasCapacity.mockRejectedValue(
                new Error("ROOM_FULL"),
            );

            await expect(
                service.joinRoom({ code: "ABC123", nickname: "Alice" }),
            ).rejects.toThrow(RoomFullError);
        });
    });

    describe("checkRoomAvailability", () => {
        it("deve confirmar disponibilidade de sala ACTIVE com Game WAITING e vagas", async () => {
            roomRepositoryMock.findByCodeWithLobby.mockResolvedValue({
                ...roomFixture,
                host: { id: roomFixture.hostId, name: "Host" },
            });

            const result = await service.checkRoomAvailability("ABC123");

            expect(result).toEqual({
                code: "ABC123",
                status: "WAITING",
                roomStatus: "ACTIVE",
                available: true,
            });
        });

        it("deve rejeitar sala com Game FINISHED, CANCELLED ou IN_PROGRESS e sala ARCHIVED", async () => {
            for (const status of [
                "FINISHED",
                "CANCELLED",
                "IN_PROGRESS",
            ] as const) {
                roomRepositoryMock.findByCodeWithLobby.mockResolvedValueOnce({
                    ...roomFixture,
                    host: { id: roomFixture.hostId, name: "Host" },
                    games: [{ ...baseGameFixture, status }],
                });

                await expect(
                    service.checkRoomAvailability("ABC123"),
                ).rejects.toThrow(RoomNotJoinableError);
            }

            roomRepositoryMock.findByCodeWithLobby.mockResolvedValueOnce({
                ...roomFixture,
                status: "ARCHIVED",
                host: { id: roomFixture.hostId, name: "Host" },
            });

            await expect(
                service.checkRoomAvailability("ABC123"),
            ).rejects.toThrow(RoomNotJoinableError);
        });
    });

    describe("getRoomLobby", () => {
        const lobbyRoom = {
            ...roomFixture,
            host: { id: roomFixture.hostId, name: "Host Teste" },
            games: [
                {
                    ...baseGameFixture,
                    players: [
                        {
                            id: "player-uuid",
                            nickname: "Alice",
                            status: "ACTIVE" as const,
                            score: 0,
                            joinedAt: baseDate,
                        },
                    ],
                },
            ],
        };

        it("deve retornar o lobby projetado para o host autenticado via JWT", async () => {
            jwtServiceMock.verify.mockReturnValue({ sub: roomFixture.hostId });
            roomRepositoryMock.findByCodeWithLobby.mockResolvedValue(lobbyRoom);

            const result = await service.getRoomLobby("ABC123", "jwt-token");

            expect(result.host).toEqual({
                id: roomFixture.hostId,
                name: "Host Teste",
            });
            expect(result.playerCount).toBe(1);
            expect(result.status).toBe("WAITING");
            expect(result.roomStatus).toBe("ACTIVE");
        });

        it("deve rejeitar token de GamePlayer de uma partida antiga quando houver nova partida na sala", async () => {
            jwtServiceMock.verify.mockImplementation(() => {
                throw new Error("not jwt");
            });
            roomPlayerRepositoryMock.findBySessionTokenHash.mockResolvedValue({
                id: "old-player-uuid",
                gameId: "game-1-old",
                status: "ACTIVE",
                game: {
                    id: "game-1-old",
                    roomId: roomFixture.id,
                    status: "FINISHED",
                    room: {
                        id: roomFixture.id,
                        status: "ACTIVE",
                        games: [
                            { id: "game-2-new", status: "WAITING" },
                            { id: "game-1-old", status: "FINISHED" },
                        ],
                    },
                },
            });
            roomRepositoryMock.findByCodeWithLobby.mockResolvedValue({
                ...lobbyRoom,
                games: [
                    {
                        ...baseGameFixture,
                        id: "game-2-new",
                        status: "WAITING",
                        players: [],
                    },
                    {
                        ...baseGameFixture,
                        id: "game-1-old",
                        status: "FINISHED",
                        players: [],
                    },
                ],
            });

            await expect(
                service.getRoomLobby("ABC123", "old-game-player-token"),
            ).rejects.toThrow(RoomAccessDeniedError);
        });

        it("deve rejeitar token inexistente de participante com RoomAuthenticationError", async () => {
            jwtServiceMock.verify.mockImplementation(() => {
                throw new Error("not jwt");
            });
            roomPlayerRepositoryMock.findBySessionTokenHash.mockResolvedValue(
                null,
            );

            await expect(
                service.getRoomLobby("ABC123", "invalid-token"),
            ).rejects.toThrow(RoomAuthenticationError);
        });
    });

    describe("listRoomGames e getGameResults", () => {
        it("deve calcular duração, vencedor, acertos/erros e ranking baseado em GamePlayer.score", async () => {
            roomRepositoryMock.findById.mockResolvedValue(roomFixture);
            roomRepositoryMock.findGamesByRoomId.mockResolvedValue([
                {
                    id: "game-fin",
                    roomId: roomFixture.id,
                    status: "FINISHED",
                    maxPlayers: 10,
                    questionTime: 30,
                    gameMode: "CLASSIC",
                    startedAt: new Date("2026-11-18T12:00:00.000Z"),
                    finishedAt: new Date("2026-11-18T12:02:30.000Z"),
                    createdAt: baseDate,
                    players: [
                        { id: "p1", nickname: "Alice", score: 250, joinedAt: baseDate },
                        { id: "p2", nickname: "Bob", score: 110, joinedAt: new Date("2026-11-18T12:00:10.000Z") },
                    ],
                    rounds: [
                        {
                            id: "r1",
                            status: "CLOSED",
                            answers: [
                                { gamePlayerId: "p1", isCorrect: true },
                                { gamePlayerId: "p2", isCorrect: false },
                            ],
                        },
                        {
                            id: "r2",
                            status: "CLOSED",
                            answers: [
                                { gamePlayerId: "p1", isCorrect: true },
                                { gamePlayerId: "p2", isCorrect: true },
                            ],
                        },
                    ],
                },
            ]);

            const games = await service.listRoomGames(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(games).toHaveLength(1);
            expect(games[0]?.durationMs).toBe(150_000);
            expect(games[0]?.winner).toEqual({
                id: "p1",
                nickname: "Alice",
                avatarId: "explorer",
                score: 250,
            });
            expect(games[0]?.ranking.map((r) => [r.position, r.nickname, r.score, r.correctCount, r.wrongCount])).toEqual([
                [1, "Alice", 250, 2, 0],
                [2, "Bob", 110, 1, 1],
            ]);
        });

        it("deve retornar lista vazia quando a sala não tiver partidas e rejeitar não-host", async () => {
            roomRepositoryMock.findById.mockResolvedValueOnce(roomFixture);
            roomRepositoryMock.findGamesByRoomId.mockResolvedValueOnce([]);

            const empty = await service.listRoomGames(
                roomFixture.id,
                roomFixture.hostId,
            );
            expect(empty).toEqual([]);

            roomRepositoryMock.findById.mockResolvedValueOnce(roomFixture);
            await expect(
                service.listRoomGames(roomFixture.id, "outro-host"),
            ).rejects.toThrow(RoomAccessDeniedError);
        });

        it("deve agregar estatísticas apenas de partidas FINISHED, tratando Hardcore negativo e partidas sem respostas", async () => {
            const { buildRoomAggregatedStats } = await import("../../src/rooms/room.service.js");

            const stats = buildRoomAggregatedStats("room-1", [
                {
                    id: "g-finished-1",
                    status: "FINISHED",
                    startedAt: new Date("2026-11-20T10:00:00.000Z"),
                    finishedAt: new Date("2026-11-20T10:05:00.000Z"),
                    createdAt: new Date("2026-11-20T09:58:00.000Z"),
                    players: [
                        { id: "p1", score: 150 },
                        { id: "p2", score: -30 },
                    ],
                    rounds: [
                        {
                            id: "r1",
                            snapshotQuestion: {
                                id: "sq-1",
                                sourceQuestionId: "q-shared",
                                statement: "Questão compartilhada",
                                position: 0,
                            },
                            answers: [
                                { gamePlayerId: "p1", isCorrect: true },
                                { gamePlayerId: "p2", isCorrect: false },
                            ],
                        },
                    ],
                },
                {
                    id: "g-cancelled",
                    status: "CANCELLED",
                    startedAt: new Date("2026-11-20T11:00:00.000Z"),
                    finishedAt: new Date("2026-11-20T11:01:00.000Z"),
                    createdAt: new Date("2026-11-20T10:59:00.000Z"),
                    players: [{ id: "p-canc", score: 500 }],
                    rounds: [],
                },
                {
                    id: "g-in-progress",
                    status: "IN_PROGRESS",
                    startedAt: new Date("2026-11-20T12:00:00.000Z"),
                    finishedAt: null,
                    createdAt: new Date("2026-11-20T11:59:00.000Z"),
                    players: [{ id: "p-live", score: 999 }],
                    rounds: [],
                },
                {
                    id: "g-finished-no-answers",
                    status: "FINISHED",
                    startedAt: new Date("2026-11-20T13:00:00.000Z"),
                    finishedAt: new Date("2026-11-20T13:02:00.000Z"),
                    createdAt: new Date("2026-11-20T12:58:00.000Z"),
                    players: [{ id: "p3", score: 0 }],
                    rounds: [
                        {
                            id: "r2",
                            snapshotQuestion: {
                                id: "sq-2",
                                sourceQuestionId: "q-shared",
                                statement: "Questão compartilhada",
                                position: 0,
                            },
                            answers: [],
                        },
                    ],
                },
            ]);

            expect(stats.finishedGamesCount).toBe(2);
            expect(stats.totalParticipations).toBe(3);
            expect(stats.averagePlayersPerGame).toBeCloseTo(1.5, 5);
            expect(stats.averageScore).toBeCloseTo(40, 5);
            expect(stats.totalAnswers).toBe(2);
            expect(stats.totalCorrectAnswers).toBe(1);
            expect(stats.totalWrongAnswers).toBe(1);
            expect(stats.averageCorrectRate).toBeCloseTo(0.5, 5);
            expect(stats.questionPerformance).toHaveLength(1);
            expect(stats.questionPerformance[0]?.gamesPlayedCount).toBe(2);
            expect(stats.questionPerformance[0]?.errorRate).toBeCloseTo(0.5, 5);
            expect(stats.hardestQuestions).toHaveLength(1);
            expect(stats.easiestQuestions).toHaveLength(1);

            // Questão com apenas 1 resposta isolada não deve ser promovida em easiestQuestions (amostra insuficiente)
            const singleAnswerStats = buildRoomAggregatedStats("room-single-answer", [
                {
                    id: "g-single",
                    status: "FINISHED",
                    startedAt: new Date("2026-11-20T13:00:00.000Z"),
                    finishedAt: new Date("2026-11-20T13:02:00.000Z"),
                    createdAt: new Date("2026-11-20T12:58:00.000Z"),
                    players: [
                        { id: "p1", score: 100 },
                        { id: "p2", score: 0 },
                    ],
                    rounds: [
                        {
                            id: "r-single",
                            snapshotQuestion: {
                                id: "sq-single",
                                sourceQuestionId: "q-single",
                                statement: "Amostra insuficiente",
                                position: 0,
                            },
                            answers: [{ gamePlayerId: "p1", isCorrect: true }],
                        },
                    ],
                },
            ]);
            expect(singleAnswerStats.easiestQuestions).toEqual([]);
            expect(singleAnswerStats.hardestQuestions).toEqual([]);

            const noAnswerStats = buildRoomAggregatedStats("room-empty-answers", [
                {
                    id: "g-only-no-answers",
                    status: "FINISHED",
                    startedAt: new Date("2026-11-20T13:00:00.000Z"),
                    finishedAt: new Date("2026-11-20T13:02:00.000Z"),
                    createdAt: new Date("2026-11-20T12:58:00.000Z"),
                    players: [{ id: "p1", score: 0 }],
                    rounds: [
                        {
                            id: "r-empty",
                            snapshotQuestion: {
                                id: "sq-empty",
                                sourceQuestionId: "q-1",
                                statement: "Pergunta sem envio",
                                position: 0,
                            },
                            answers: [],
                        },
                    ],
                },
            ]);
            expect(noAnswerStats.averageCorrectRate).toBeNull();
            expect(noAnswerStats.hardestQuestions).toEqual([]);
            expect(noAnswerStats.easiestQuestions).toEqual([]);
        });
    });

    describe("archiveRoom", () => {
        it("deve arquivar sala do host e projetar roomStatus ARCHIVED com archivedAt", async () => {
            const archivedAt = new Date("2026-11-20T12:00:00.000Z");
            roomRepositoryMock.archiveByHost.mockResolvedValue({
                success: true,
                alreadyArchived: false,
                room: {
                    ...roomFixture,
                    status: "ARCHIVED" as const,
                    archivedAt,
                    games: [baseGameFixture],
                },
            });

            const projected = await service.archiveRoom(
                roomFixture.id,
                roomFixture.hostId,
            );

            expect(projected.roomStatus).toBe("ARCHIVED");
            expect(projected.archivedAt).toEqual(archivedAt);
        });

        it("deve lançar RoomNotFoundError ou RoomAccessDeniedError quando falhar", async () => {
            roomRepositoryMock.archiveByHost.mockResolvedValueOnce({
                success: false,
                reason: "ROOM_NOT_FOUND",
            });
            await expect(
                service.archiveRoom(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(RoomNotFoundError);

            roomRepositoryMock.archiveByHost.mockResolvedValueOnce({
                success: false,
                reason: "ACCESS_DENIED",
            });
            await expect(
                service.archiveRoom(roomFixture.id, "outro-host"),
            ).rejects.toThrow(RoomAccessDeniedError);
        });

        it("deve impedir carregamento no lobby ao vivo (getRoomLobby) para sala ARCHIVED", async () => {
            jwtServiceMock.verify.mockReturnValue({ sub: roomFixture.hostId });
            roomRepositoryMock.findByCodeWithLobby.mockResolvedValue({
                ...roomFixture,
                status: "ARCHIVED" as const,
                archivedAt: baseDate,
                host: { id: roomFixture.hostId, name: "Host" },
            });

            await expect(
                service.getRoomLobby("ABC123", "jwt-token"),
            ).rejects.toThrow(RoomNotEditableError);
        });

        it.each(["LEFT", "ABANDONED"] as const)(
            "deve rejeitar token de participante com status %s com RoomAuthenticationError",
            async (status) => {
                jwtServiceMock.verify.mockImplementation(() => {
                    throw new Error("not jwt");
                });
                roomPlayerRepositoryMock.findBySessionTokenHash.mockResolvedValue({
                    id: "inactive-player-uuid",
                    gameId: baseGameFixture.id,
                    status,
                    game: {
                        id: baseGameFixture.id,
                        roomId: roomFixture.id,
                        status: "IN_PROGRESS",
                        room: {
                            id: roomFixture.id,
                            status: "ACTIVE",
                            games: [
                                { id: baseGameFixture.id, status: "IN_PROGRESS" },
                            ],
                        },
                    },
                });

                await expect(
                    service.getRoomLobby("ABC123", "inactive-player-token"),
                ).rejects.toThrow(RoomAuthenticationError);
            },
        );

        it("em WAITING deve contar e listar apenas ACTIVE, enquanto em IN_PROGRESS preserva histórico e expõe eligiblePlayerCount", async () => {
            jwtServiceMock.verify.mockReturnValue({ sub: roomFixture.hostId });

            const lobbyBase = {
                ...roomFixture,
                host: { id: roomFixture.hostId, name: "Host Teste" },
            };

            roomRepositoryMock.findByCodeWithLobby.mockResolvedValueOnce({
                ...lobbyBase,
                games: [
                    {
                        ...baseGameFixture,
                        status: "WAITING",
                        players: [
                            { id: "p1", nickname: "Ana", status: "ACTIVE", score: 0, joinedAt: baseDate },
                            { id: "p2", nickname: "Bob", status: "LEFT", score: 0, joinedAt: baseDate },
                        ],
                    },
                ],
            });

            const waitingLobby = await service.getRoomLobby("ABC123", "jwt-token");
            expect(waitingLobby.playerCount).toBe(1);
            expect(waitingLobby.currentGame?.eligiblePlayerCount).toBe(1);
            expect(waitingLobby.players.map((p) => p.id)).toEqual(["p1"]);

            roomRepositoryMock.findByCodeWithLobby.mockResolvedValueOnce({
                ...lobbyBase,
                games: [
                    {
                        ...baseGameFixture,
                        status: "IN_PROGRESS",
                        players: [
                            { id: "p1", nickname: "Ana", status: "ACTIVE", score: 120, joinedAt: baseDate },
                            { id: "p2", nickname: "Bob", status: "ABANDONED", score: 95, joinedAt: baseDate },
                        ],
                    },
                ],
            });

            const activeGameLobby = await service.getRoomLobby("ABC123", "jwt-token");
            expect(activeGameLobby.playerCount).toBe(2);
            expect(activeGameLobby.currentGame?.eligiblePlayerCount).toBe(1);
            expect(activeGameLobby.players.map((p) => p.id)).toEqual(["p1", "p2"]);
        });
    });

    describe("checkRoomAvailability - elegibilidade", () => {
        it("não deve contabilizar jogadores LEFT ou ABANDONED na lotação da sala", async () => {
            roomRepositoryMock.findByCodeWithLobby.mockResolvedValue({
                ...roomFixture,
                games: [
                    {
                        ...baseGameFixture,
                        maxPlayers: 2,
                        players: [
                            { id: "p1", nickname: "Ana", status: "ACTIVE", score: 0, joinedAt: baseDate },
                            { id: "p2", nickname: "Bob", status: "LEFT", score: 0, joinedAt: baseDate },
                            { id: "p3", nickname: "Caio", status: "ABANDONED", score: 0, joinedAt: baseDate },
                        ],
                    },
                ],
            });

            const availability = await service.checkRoomAvailability("ABC123");

            expect(availability).toEqual({
                code: roomFixture.code,
                status: "WAITING",
                roomStatus: "ACTIVE",
                available: true,
            });
        });
    });

    describe("finishRoom", () => {
        it("deve projetar sala FINISHED, ranking ordenado e closedRoundPayload quando havia rodada aberta", async () => {
            const finishedAt = new Date("2026-11-20T16:10:00.000Z");
            const players = [
                { id: "p2", nickname: "Bob", score: 100, joinedAt: new Date("2026-11-20T16:00:05.000Z") },
                { id: "p1", nickname: "Alice", score: 250, joinedAt: baseDate },
            ];
            const finishedGame = {
                ...baseGameFixture,
                status: "FINISHED" as const,
                startedAt: baseDate,
                finishedAt,
            };

            roomRepositoryMock.finishActiveGame.mockResolvedValue({
                success: true,
                alreadyFinished: false,
                room: { ...roomFixture, games: [finishedGame] },
                game: finishedGame,
                closedRound: null,
                players,
            });

            const res = await service.finishRoom(roomFixture.id, roomFixture.hostId);

            expect(res.room.status).toBe("FINISHED");
            expect(res.finishedAt).toEqual(finishedAt);
            expect(res.alreadyFinished).toBe(false);
            expect(res.closedRoundPayload).toBeNull();
            expect(res.ranking).toEqual([
                { id: "p1", nickname: "Alice", avatarId: "explorer", score: 250, position: 1 },
                { id: "p2", nickname: "Bob", avatarId: "explorer", score: 100, position: 2 },
            ]);
        });

        it("deve lançar erros de domínio adequados quando partida não estiver em andamento ou usuário não for host", async () => {
            roomRepositoryMock.finishActiveGame.mockResolvedValueOnce({
                success: false,
                reason: "ACCESS_DENIED",
            });
            await expect(
                service.finishRoom(roomFixture.id, "outro"),
            ).rejects.toThrow(RoomAccessDeniedError);

            roomRepositoryMock.finishActiveGame.mockResolvedValueOnce({
                success: false,
                reason: "GAME_NOT_IN_PROGRESS",
            });
            await expect(
                service.finishRoom(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(RoomNotEditableError);
        });
    });

    describe("leaveRoom", () => {
        it("deve delegar saída e mapear motivos de falha para erros de domínio", async () => {
            roomPlayerRepositoryMock.leaveRoom.mockResolvedValueOnce({
                success: true,
                roomId: "room-test-uuid",
                gameId: "game-test-uuid",
                gameStatus: "WAITING",
                player: {
                    id: "gp-1",
                    nickname: "Alice",
                    status: "LEFT",
                    score: 0,
                },
                eligiblePlayerCount: 1,
                openRoundId: null,
            });

            const res = await service.leaveRoom("gp-1", "room-test-uuid");
            expect(res.gameStatus).toBe("WAITING");
            expect(res.eligiblePlayerCount).toBe(1);

            roomPlayerRepositoryMock.leaveRoom.mockResolvedValueOnce({
                success: false,
                reason: "PLAYER_NOT_ACTIVE",
            });
            await expect(
                service.leaveRoom("gp-1", "room-test-uuid"),
            ).rejects.toThrow(RoomAuthenticationError);

            roomPlayerRepositoryMock.leaveRoom.mockResolvedValueOnce({
                success: false,
                reason: "GAME_NOT_LEAVABLE",
            });
            await expect(
                service.leaveRoom("gp-1", "room-test-uuid"),
            ).rejects.toThrow(RoomNotEditableError);
        });
    });

    describe("ranking competitivo vs histórico na projeção da sala", () => {
        it("lastClosedRound reconstruído em getRoomLobby deve excluir LEFT e ABANDONED do ranking mantendo ACTIVE e preservando histórico completo", async () => {
            jwtServiceMock.verify.mockReturnValue({ sub: roomFixture.hostId });
            roomRepositoryMock.findByCodeWithLobby.mockResolvedValue({
                ...roomFixture,
                host: { id: roomFixture.hostId, name: "Host Teste" },
                games: [
                    {
                        ...baseGameFixture,
                        status: "IN_PROGRESS" as const,
                        players: [
                            { id: "p1", nickname: "Ana", status: "ACTIVE" as const, score: 120, joinedAt: baseDate },
                            { id: "p2", nickname: "Bob", status: "ACTIVE" as const, score: 180, joinedAt: baseDate },
                            { id: "p3", nickname: "Carol", status: "LEFT" as const, score: 220, joinedAt: baseDate },
                            { id: "p4", nickname: "Dave", status: "ABANDONED" as const, score: 210, joinedAt: baseDate },
                        ],
                        rounds: [
                            {
                                id: "round-1",
                                roundNumber: 1,
                                status: "CLOSED" as const,
                                openedAt: baseDate,
                                expiresAt: new Date(baseDate.getTime() + 30_000),
                                closedAt: new Date(baseDate.getTime() + 10_000),
                                timeLimit: 30,
                                snapshotQuestion: {
                                    id: "sq-1",
                                    statement: "Pergunta 1",
                                    type: "MULTIPLE_CHOICE" as const,
                                    position: 0,
                                    options: [
                                        { id: "opt-1", text: "Correta", isCorrect: true, position: 0 },
                                    ],
                                },
                                answers: [
                                    {
                                        id: "ans-3",
                                        isCorrect: true,
                                        points: 220,
                                        answeredAt: baseDate,
                                        gamePlayer: { id: "p3", nickname: "Carol" },
                                        option: { id: "opt-1", text: "Correta", isCorrect: true },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            });

            const lobby = await service.getRoomLobby("ABC123", "jwt-token");

            expect(lobby.currentGame?.lastClosedRound?.ranking).toEqual([
                { id: "p2", nickname: "Bob", avatarId: "explorer", score: 180 },
                { id: "p1", nickname: "Ana", avatarId: "explorer", score: 120 },
            ]);
            // Histórico de respostas da rodada e lista de jogadores da partida seguem preservados
            expect(lobby.currentGame?.lastClosedRound?.answers).toHaveLength(1);
            expect(lobby.players).toHaveLength(4);
        });
    });
});
