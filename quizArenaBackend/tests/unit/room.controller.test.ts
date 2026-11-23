import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { emitRoomEventMock, disconnectPlayerSocketsMock } = vi.hoisted(() => ({
    emitRoomEventMock: vi.fn(),
    disconnectPlayerSocketsMock: vi.fn(),
}));

vi.mock("../../src/realtime/room-events.js", () => ({
    emitRoomEvent: emitRoomEventMock,
    disconnectPlayerSockets: disconnectPlayerSocketsMock,
}));

import { RoomController } from "../../src/rooms/room.controller.js";
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

function createResponseMock() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };

    return res as unknown as Response & {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };
}

describe("RoomController", () => {
    let roomServiceMock: {
        createRoom: ReturnType<typeof vi.fn>;
        listHostRooms: ReturnType<typeof vi.fn>;
        updateRoom: ReturnType<typeof vi.fn>;
        startRoom: ReturnType<typeof vi.fn>;
        playAgain: ReturnType<typeof vi.fn>;
        archiveRoom: ReturnType<typeof vi.fn>;
        finishRoom: ReturnType<typeof vi.fn>;
        joinRoom: ReturnType<typeof vi.fn>;
        leaveRoom: ReturnType<typeof vi.fn>;
        checkRoomAvailability: ReturnType<typeof vi.fn>;
        getRoomLobby: ReturnType<typeof vi.fn>;
    };

    let roundServiceMock: {
        tryCloseRoundIfReady: ReturnType<typeof vi.fn>;
    };

    let controller: RoomController;

    const baseDate = new Date("2026-11-18T12:00:00.000Z");

    const projectedRoomFixture = {
        id: "room-test-uuid",
        code: "ABC123",
        name: "Sala Principal",
        theme: "Ciência",
        hostId: "user-host-uuid",
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC" as const,
        status: "WAITING" as const,
        roomStatus: "ACTIVE" as const,
        archivedAt: null,
        createdAt: baseDate,
        updatedAt: baseDate,
        players: [
            {
                id: "player-uuid",
                nickname: "Alice",
                score: 0,
                joinedAt: baseDate,
            },
        ],
        currentGame: {
            id: "game-test-uuid",
            status: "WAITING" as const,
            maxPlayers: 10,
            questionTime: 30,
            gameMode: "CLASSIC" as const,
            startedAt: null,
            finishedAt: null,
            createdAt: baseDate,
            playerCount: 1,
            players: [
                {
                    id: "player-uuid",
                    nickname: "Alice",
                    score: 0,
                    joinedAt: baseDate,
                },
            ],
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        roomServiceMock = {
            createRoom: vi.fn(),
            listHostRooms: vi.fn(),
            updateRoom: vi.fn(),
            startRoom: vi.fn(),
            playAgain: vi.fn(),
            archiveRoom: vi.fn(),
            finishRoom: vi.fn(),
            joinRoom: vi.fn(),
            leaveRoom: vi.fn(),
            checkRoomAvailability: vi.fn(),
            getRoomLobby: vi.fn(),
        };
        roundServiceMock = {
            tryCloseRoundIfReady: vi.fn(),
        };
        controller = new RoomController(
            roomServiceMock as never,
            roundServiceMock as never,
        );
    });

    describe("create", () => {
        it("deve criar uma sala para o host autenticado", async () => {
            roomServiceMock.createRoom.mockResolvedValue(projectedRoomFixture);
            const req = {
                user: { id: "user-host-uuid" },
                body: { maxPlayers: 10, questionTime: 30, gameMode: "CLASSIC" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.create(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(projectedRoomFixture);
        });

        it("deve retornar 400 quando dados da sala forem inválidos", async () => {
            roomServiceMock.createRoom.mockRejectedValue(
                new InvalidRoomDataError("Dados inválidos.", {
                    maxPlayers: "Inválido",
                }),
            );
            const req = {
                user: { id: "user-host-uuid" },
                body: {},
            } as unknown as Request;
            const res = createResponseMock();

            await controller.create(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });
    });

    describe("listByHost", () => {
        it("deve listar salas do host autenticado", async () => {
            roomServiceMock.listHostRooms.mockResolvedValue([
                projectedRoomFixture,
            ]);
            const req = {
                user: { id: "user-host-uuid" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.listByHost(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                rooms: [projectedRoomFixture],
            });
        });
    });

    describe("update", () => {
        it("deve atualizar configurações da sala e emitir room:updated", async () => {
            const updatedRoom = { ...projectedRoomFixture, maxPlayers: 20 };
            roomServiceMock.updateRoom.mockResolvedValue(updatedRoom);
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
                body: { maxPlayers: 20 },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.update(req, res);

            expect(emitRoomEventMock).toHaveBeenCalledWith(
                updatedRoom.id,
                "room:updated",
                expect.objectContaining({ maxPlayers: 20 }),
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(updatedRoom);
        });

        it("deve retornar 409 quando a sala não puder ser editada", async () => {
            roomServiceMock.updateRoom.mockRejectedValue(
                new RoomNotEditableError("Não editável."),
            );
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
                body: { maxPlayers: 20 },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.update(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
        });
    });

    describe("start", () => {
        it("deve iniciar a partida e emitir game:started", async () => {
            const started = {
                ...projectedRoomFixture,
                status: "IN_PROGRESS" as const,
            };
            roomServiceMock.startRoom.mockResolvedValue(started);
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.start(req, res);

            expect(emitRoomEventMock).toHaveBeenCalledWith(
                started.id,
                "game:started",
                { roomId: started.id, status: "IN_PROGRESS" },
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(started);
        });

        it("deve retornar 409 com código e detalhes quando requisitos mínimos não forem atingidos", async () => {
            const details = {
                currentPlayers: 1,
                requiredPlayers: 2,
                currentQuestions: 3,
                requiredQuestions: 5,
                missingPlayers: true,
                missingQuestions: true,
            };
            roomServiceMock.startRoom.mockRejectedValue(
                new RoomStartRequirementsError(
                    "START_REQUIREMENTS_NOT_MET",
                    details,
                ),
            );
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.start(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({
                message:
                    "Não é possível iniciar a partida: são necessários pelo menos 2 jogadores ativos (atual: 1) e pelo menos 5 perguntas ativas (atual: 3).",
                code: "START_REQUIREMENTS_NOT_MET",
                requirements: details,
            });
        });
    });

    describe("playAgain", () => {
        it("deve preparar nova partida e retornar 201 com a sala atualizada", async () => {
            const nextGameRoom = {
                ...projectedRoomFixture,
                players: [],
                currentGame: {
                    ...projectedRoomFixture.currentGame,
                    id: "game-2-uuid",
                    playerCount: 0,
                    players: [],
                },
            };
            roomServiceMock.playAgain.mockResolvedValue(nextGameRoom);
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.playAgain(req, res);

            expect(roomServiceMock.playAgain).toHaveBeenCalledWith(
                projectedRoomFixture.id,
                "user-host-uuid",
            );
            expect(emitRoomEventMock).toHaveBeenCalledWith(
                projectedRoomFixture.id,
                "game:created",
                {
                    roomId: projectedRoomFixture.id,
                    status: nextGameRoom.status,
                    maxPlayers: nextGameRoom.maxPlayers,
                    questionTime: nextGameRoom.questionTime,
                    gameMode: nextGameRoom.gameMode,
                    currentGame: nextGameRoom.currentGame,
                },
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(nextGameRoom);
        });

        it("deve retornar 409 quando já existir partida ativa ou sala arquivada", async () => {
            roomServiceMock.playAgain.mockRejectedValueOnce(
                new RoomReplayNotAllowedError(),
            );
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
            } as unknown as Request;
            const res1 = createResponseMock();

            await controller.playAgain(req, res1);
            expect(res1.status).toHaveBeenCalledWith(409);
            expect(emitRoomEventMock).not.toHaveBeenCalled();

            roomServiceMock.playAgain.mockRejectedValueOnce(
                new RoomNotEditableError("Arquivada."),
            );
            const res2 = createResponseMock();

            await controller.playAgain(req, res2);
            expect(res2.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 403 e 404 para acesso negado e sala inexistente", async () => {
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
            } as unknown as Request;

            roomServiceMock.playAgain.mockRejectedValueOnce(
                new RoomAccessDeniedError(),
            );
            const res403 = createResponseMock();
            await controller.playAgain(req, res403);
            expect(res403.status).toHaveBeenCalledWith(403);

            roomServiceMock.playAgain.mockRejectedValueOnce(
                new RoomNotFoundError(),
            );
            const res404 = createResponseMock();
            await controller.playAgain(req, res404);
            expect(res404.status).toHaveBeenCalledWith(404);
        });
    });

    describe("join", () => {
        it("deve registrar jogador e emitir player:joined", async () => {
            const joinResult = {
                player: {
                    id: "player-uuid",
                    gameId: "game-test-uuid",
                    roomId: projectedRoomFixture.id,
                    userId: null,
                    nickname: "Alice",
                    score: 0,
                    joinedAt: baseDate,
                },
                sessionToken: "session-token",
            };
            roomServiceMock.joinRoom.mockResolvedValue(joinResult);
            const req = {
                body: { code: "ABC123", nickname: "Alice" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.join(req, res);

            expect(emitRoomEventMock).toHaveBeenCalledWith(
                projectedRoomFixture.id,
                "player:joined",
                expect.objectContaining({
                    roomId: projectedRoomFixture.id,
                }),
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(joinResult);
        });

        it("deve retornar 409 para RoomFullError, RoomNotJoinableError e DuplicateNicknameError", async () => {
            const req = { body: { code: "ABC123", nickname: "Alice" } } as Request;

            for (const err of [
                new RoomFullError(),
                new RoomNotJoinableError(),
                new DuplicateNicknameError(),
            ]) {
                roomServiceMock.joinRoom.mockRejectedValueOnce(err);
                const res = createResponseMock();
                await controller.join(req, res);
                expect(res.status).toHaveBeenCalledWith(409);
            }
        });
    });

    describe("checkAvailability", () => {
        it("deve retornar 200 com disponibilidade da sala", async () => {
            const availability = {
                code: "ABC123",
                status: "WAITING",
                roomStatus: "ACTIVE",
                available: true,
            };
            roomServiceMock.checkRoomAvailability.mockResolvedValue(
                availability,
            );
            const req = { params: { code: "abc123" } } as unknown as Request;
            const res = createResponseMock();

            await controller.checkAvailability(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ room: availability });
        });
    });

    describe("getLobby", () => {
        it("deve retornar os dados do lobby com players da partida atual", async () => {
            const lobbyFixture = {
                ...projectedRoomFixture,
                host: {
                    id: "user-host-uuid",
                    name: "Host Teste",
                },
                playerCount: 1,
            };
            roomServiceMock.getRoomLobby.mockResolvedValue(lobbyFixture);
            const req = {
                params: { code: "abc123" },
                headers: { authorization: "Bearer valid-token" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.getLobby(req, res);

            expect(roomServiceMock.getRoomLobby).toHaveBeenCalledWith(
                "ABC123",
                "valid-token",
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                room: lobbyFixture,
            });
        });

        it("deve retornar 401 quando RoomAuthenticationError for lançado", async () => {
            roomServiceMock.getRoomLobby.mockRejectedValue(
                new RoomAuthenticationError(),
            );
            const req = {
                params: { code: "ABC123" },
                headers: { authorization: "Bearer bad-token" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.getLobby(req, res);

            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe("archive", () => {
        it("deve arquivar sala do host, emitir room:archived e retornar 200", async () => {
            const archivedRoom = {
                ...projectedRoomFixture,
                roomStatus: "ARCHIVED" as const,
                archivedAt: baseDate,
            };
            roomServiceMock.archiveRoom.mockResolvedValue(archivedRoom);
            const req = {
                params: { id: projectedRoomFixture.id },
                user: { id: "user-host-uuid" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.archive(req, res);

            expect(roomServiceMock.archiveRoom).toHaveBeenCalledWith(
                projectedRoomFixture.id,
                "user-host-uuid",
            );
            expect(emitRoomEventMock).toHaveBeenCalledWith(
                projectedRoomFixture.id,
                "room:archived",
                {
                    roomId: projectedRoomFixture.id,
                    roomStatus: "ARCHIVED",
                    archivedAt: baseDate,
                },
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                message: "Sala arquivada com sucesso.",
                room: archivedRoom,
            });
        });

        it("deve retornar 401, 403 e 404 conforme erro no arquivamento", async () => {
            const unauthReq = {
                params: { id: "room-test-uuid" },
            } as unknown as Request;
            const unauthRes = createResponseMock();
            await controller.archive(unauthReq, unauthRes);
            expect(unauthRes.status).toHaveBeenCalledWith(401);

            roomServiceMock.archiveRoom.mockRejectedValueOnce(
                new RoomAccessDeniedError(),
            );
            const forbiddenReq = {
                params: { id: "room-test-uuid" },
                user: { id: "other-user" },
            } as unknown as Request;
            const forbiddenRes = createResponseMock();
            await controller.archive(forbiddenReq, forbiddenRes);
            expect(forbiddenRes.status).toHaveBeenCalledWith(403);

            roomServiceMock.archiveRoom.mockRejectedValueOnce(
                new RoomNotFoundError(),
            );
            const notFoundReq = {
                params: { id: "room-test-uuid" },
                user: { id: "user-host-uuid" },
            } as unknown as Request;
            const notFoundRes = createResponseMock();
            await controller.archive(notFoundReq, notFoundRes);
            expect(notFoundRes.status).toHaveBeenCalledWith(404);
        });
    });

    describe("finish", () => {
        it("deve encerrar partida em andamento, emitir round:closed e game:finished com ranking", async () => {
            const finishedAt = new Date("2026-11-20T16:10:00.000Z");
            const finishedRoom = {
                ...projectedRoomFixture,
                status: "FINISHED" as const,
            };
            const closedRoundPayload = {
                round: {
                    id: "round-1",
                    roundNumber: 1,
                    status: "CLOSED",
                },
            };
            const ranking = [{ id: "player-uuid", nickname: "Alice", score: 150, position: 1 }];

            roomServiceMock.finishRoom.mockResolvedValue({
                room: finishedRoom,
                gameId: "game-test-uuid",
                finishedAt,
                alreadyFinished: false,
                closedRoundPayload,
                ranking,
            });

            const req = {
                params: { id: projectedRoomFixture.id },
                user: { id: "user-host-uuid" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.finish(req, res);

            expect(emitRoomEventMock).toHaveBeenNthCalledWith(
                1,
                projectedRoomFixture.id,
                "round:closed",
                closedRoundPayload,
            );
            expect(emitRoomEventMock).toHaveBeenNthCalledWith(
                2,
                projectedRoomFixture.id,
                "game:finished",
                {
                    roomId: projectedRoomFixture.id,
                    gameId: "game-test-uuid",
                    finishedAt,
                    ranking,
                },
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("não deve reemitir eventos quando alreadyFinished for true e deve mapear 401/403/409", async () => {
            roomServiceMock.finishRoom.mockResolvedValueOnce({
                room: { ...projectedRoomFixture, status: "FINISHED" },
                gameId: "game-test-uuid",
                finishedAt: baseDate,
                alreadyFinished: true,
                closedRoundPayload: null,
                ranking: [],
            });
            const req = {
                params: { id: projectedRoomFixture.id },
                user: { id: "user-host-uuid" },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.finish(req, res);
            expect(emitRoomEventMock).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);

            roomServiceMock.finishRoom.mockRejectedValueOnce(new RoomNotEditableError());
            const conflictRes = createResponseMock();
            await controller.finish(req, conflictRes);
            expect(conflictRes.status).toHaveBeenCalledWith(409);

            const unauthRes = createResponseMock();
            await controller.finish({ params: { id: "room-test-uuid" } } as unknown as Request, unauthRes);
            expect(unauthRes.status).toHaveBeenCalledWith(401);

            roomServiceMock.finishRoom.mockRejectedValueOnce(new RoomAccessDeniedError());
            const forbiddenRes = createResponseMock();
            await controller.finish(req, forbiddenRes);
            expect(forbiddenRes.status).toHaveBeenCalledWith(403);
        });
    });

    describe("leave", () => {
        it("deve desconectar socket, emitir player:left e verificar fechamento antecipado de rodada aberta", async () => {
            roomServiceMock.leaveRoom.mockResolvedValue({
                roomId: "room-test-uuid",
                gameId: "game-test-uuid",
                gameStatus: "IN_PROGRESS",
                player: {
                    id: "player-uuid",
                    nickname: "Alice",
                    status: "LEFT",
                    score: 120,
                },
                eligiblePlayerCount: 2,
                openRoundId: "round-open-uuid",
            });

            const req = {
                roomPlayer: {
                    id: "player-uuid",
                    roomId: "room-test-uuid",
                },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.leave(req, res);

            expect(roomServiceMock.leaveRoom).toHaveBeenCalledWith(
                "player-uuid",
                "room-test-uuid",
            );
            expect(disconnectPlayerSocketsMock).toHaveBeenCalledWith(
                "room-test-uuid",
                "player-uuid",
            );
            expect(emitRoomEventMock).toHaveBeenCalledWith(
                "room-test-uuid",
                "player:left",
                {
                    roomId: "room-test-uuid",
                    gameId: "game-test-uuid",
                    gameStatus: "IN_PROGRESS",
                    player: {
                        id: "player-uuid",
                        nickname: "Alice",
                        status: "LEFT",
                        score: 120,
                    },
                    eligiblePlayerCount: 2,
                },
            );
            expect(roundServiceMock.tryCloseRoundIfReady).toHaveBeenCalledWith(
                "round-open-uuid",
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("deve emitir game:finished CANCELLED após player:left e ignorar tryCloseRoundIfReady quando restar menos de 2 elegíveis", async () => {
            const finishedAt = new Date("2026-11-22T21:00:00.000Z");
            roomServiceMock.leaveRoom.mockResolvedValue({
                roomId: "room-test-uuid",
                gameId: "game-test-uuid",
                gameStatus: "IN_PROGRESS",
                player: {
                    id: "player-uuid",
                    nickname: "Alice",
                    status: "LEFT",
                    score: 120,
                },
                eligiblePlayerCount: 1,
                openRoundId: null,
                cancelledGame: {
                    gameId: "game-test-uuid",
                    status: "CANCELLED",
                    reason: "INSUFFICIENT_PLAYERS",
                    finishedAt,
                    ranking: [
                        { id: "player-2", nickname: "Bob", score: 90, position: 1 },
                    ],
                },
            });

            const req = {
                roomPlayer: {
                    id: "player-uuid",
                    roomId: "room-test-uuid",
                },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.leave(req, res);

            expect(emitRoomEventMock).toHaveBeenNthCalledWith(
                1,
                "room-test-uuid",
                "player:left",
                expect.objectContaining({
                    eligiblePlayerCount: 1,
                }),
            );
            expect(emitRoomEventMock).toHaveBeenNthCalledWith(
                2,
                "room-test-uuid",
                "game:finished",
                {
                    roomId: "room-test-uuid",
                    gameId: "game-test-uuid",
                    status: "CANCELLED",
                    reason: "INSUFFICIENT_PLAYERS",
                    finishedAt,
                    ranking: [
                        { id: "player-2", nickname: "Bob", score: 90, position: 1 },
                    ],
                },
            );
            expect(roundServiceMock.tryCloseRoundIfReady).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ gameCancelled: true }),
            );
        });

        it("deve mapear 401 sem roomPlayer ou sessão inválida e 409 quando partida não aceita saída", async () => {
            const noPlayerRes = createResponseMock();
            await controller.leave({} as unknown as Request, noPlayerRes);
            expect(noPlayerRes.status).toHaveBeenCalledWith(401);

            const req = {
                roomPlayer: { id: "player-uuid", roomId: "room-test-uuid" },
            } as unknown as Request;

            roomServiceMock.leaveRoom.mockRejectedValueOnce(
                new RoomAuthenticationError("Sessão de participante inválida."),
            );
            const invalidRes = createResponseMock();
            await controller.leave(req, invalidRes);
            expect(invalidRes.status).toHaveBeenCalledWith(401);

            roomServiceMock.leaveRoom.mockRejectedValueOnce(
                new RoomNotEditableError("Partida já encerrada."),
            );
            const conflictRes = createResponseMock();
            await controller.leave(req, conflictRes);
            expect(conflictRes.status).toHaveBeenCalledWith(409);
        });
    });
});
