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
        findGamesByRoomId: ReturnType<typeof vi.fn>;
        findGameResultsById: ReturnType<typeof vi.fn>;
    };

    let codeGeneratorMock: {
        generate: ReturnType<typeof vi.fn>;
    };

    let roomPlayerRepositoryMock: {
        createIfRoomHasCapacity: ReturnType<typeof vi.fn>;
        findBySessionTokenHash: ReturnType<typeof vi.fn>;
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
            findGamesByRoomId: vi.fn(),
            findGameResultsById: vi.fn(),
        };

        codeGeneratorMock = {
            generate: vi.fn(),
        };

        roomPlayerRepositoryMock = {
            createIfRoomHasCapacity: vi.fn(),
            findBySessionTokenHash: vi.fn(),
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
                            { id: "p1", nickname: "A", score: 0, joinedAt: baseDate },
                            { id: "p2", nickname: "B", score: 0, joinedAt: baseDate },
                            { id: "p3", nickname: "C", score: 0, joinedAt: baseDate },
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
            });
            await expect(
                service.startRoom(roomFixture.id, roomFixture.hostId),
            ).rejects.toThrow(RoomStartRequirementsError);
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
    });
});
