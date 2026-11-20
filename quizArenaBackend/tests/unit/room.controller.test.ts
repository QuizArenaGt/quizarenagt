import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { emitRoomEventMock } = vi.hoisted(() => ({
    emitRoomEventMock: vi.fn(),
}));

vi.mock("../../src/realtime/room-events.js", () => ({
    emitRoomEvent: emitRoomEventMock,
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
        joinRoom: ReturnType<typeof vi.fn>;
        checkRoomAvailability: ReturnType<typeof vi.fn>;
        getRoomLobby: ReturnType<typeof vi.fn>;
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
            joinRoom: vi.fn(),
            checkRoomAvailability: vi.fn(),
            getRoomLobby: vi.fn(),
        };
        controller = new RoomController(roomServiceMock as never);
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

        it("deve retornar 409 quando requisitos mínimos não forem atingidos", async () => {
            roomServiceMock.startRoom.mockRejectedValue(
                new RoomStartRequirementsError("NOT_ENOUGH_PLAYERS"),
            );
            const req = {
                user: { id: "user-host-uuid" },
                params: { id: projectedRoomFixture.id },
            } as unknown as Request;
            const res = createResponseMock();

            await controller.start(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
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
});
