
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { RoomController } from "../../src/rooms/room.controller.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
    RoomAuthenticationError,
    RoomStartRequirementsError,
} from "../../src/rooms/room.errors.js";
import type { RoomService } from "../../src/rooms/room.service.js";

describe("RoomController", () => {
    let roomService: {
        createRoom: ReturnType<typeof vi.fn>;
        updateRoom: ReturnType<typeof vi.fn>;
        getRoomLobby: ReturnType<typeof vi.fn>;
        startRoom: ReturnType<typeof vi.fn>;
    };

    let controller: RoomController;

    type AuthenticatedRequest = Request & {
        user: {
            id: string;
            role: "HOST";
        };
    };

    let req: Partial<AuthenticatedRequest>;
    let res: {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };

    const authenticatedUser = {
        id: "authenticated-host-uuid",
        role: "HOST" as const,
    };

    const validBody = {
        maxPlayers: 10,
        questionTime: 30,
        gameMode: "CLASSIC",
    };

    const roomFixture = {
        id: "room-test-uuid",
        code: "ABC123",
        hostId: authenticatedUser.id,
        ...validBody,
        status: "WAITING",
    };

    beforeEach(() => {
        roomService = {
            createRoom: vi.fn(),
            updateRoom: vi.fn(),
            getRoomLobby: vi.fn(),
            startRoom: vi.fn(),

        };

        controller = new RoomController(
            roomService as unknown as RoomService,
        );

        req = {
            body: validBody,
            params: { id: roomFixture.id },
            user: authenticatedUser,
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("create", () => {
        it("deve retornar 401 quando não houver usuário autenticado", async () => {
            req.user = undefined as unknown as AuthenticatedRequest["user"];

            await controller.create(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(roomService.createRoom).not.toHaveBeenCalled();
        });

        it("deve criar uma sala e retornar 201 com os dados da sala", async () => {
            roomService.createRoom.mockResolvedValue(roomFixture);

            await controller.create(
                req as Request,
                res as unknown as Response,
            );

            expect(roomService.createRoom).toHaveBeenCalledWith({
                ...validBody,
                hostId: authenticatedUser.id,
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(roomFixture);
        });

        it("deve retornar 400 imediatamente quando houver erro de validação", async () => {
            roomService.createRoom.mockRejectedValue(
                new InvalidRoomDataError("Dados inválidos.", {
                    maxPlayers:
                        "A quantidade de jogadores deve ser um número inteiro entre 2 e 50.",
                }),
            );

            await controller.create(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Dados inválidos.",
                errors: {
                    maxPlayers:
                        "A quantidade de jogadores deve ser um número inteiro entre 2 e 50.",
                },
            });
        });

        it("deve retornar 500 com mensagem amigável sem expor detalhes internos quando ocorrer erro no servidor", async () => {
            const consoleSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => { });

            roomService.createRoom.mockRejectedValue(
                new Error("FATAL: database connection refused on port 5432"),
            );

            await controller.create(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                message: "Erro interno ao criar sala.",
            });
            expect(consoleSpy).toHaveBeenCalled();
        });
    });

    describe("update", () => {
        it("deve retornar 401 quando não houver usuário autenticado", async () => {
            req.user = undefined as unknown as AuthenticatedRequest["user"];

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(roomService.updateRoom).not.toHaveBeenCalled();
        });

        it("deve retornar 400 quando o identificador da sala for inválido", async () => {
            req.params = {} as Request["params"];

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Identificador da sala inválido.",
            });
            expect(roomService.updateRoom).not.toHaveBeenCalled();
        });

        it("deve atualizar a sala e retornar 200", async () => {
            roomService.updateRoom.mockResolvedValue(roomFixture);

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(roomService.updateRoom).toHaveBeenCalledWith({
                roomId: roomFixture.id,
                hostId: authenticatedUser.id,
                data: validBody,
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(roomFixture);
        });

        it("deve utilizar o ID do usuário autenticado, ignorando hostId enviado no body", async () => {
            req.body = {
                maxPlayers: 20,
                hostId: "fake-host-uuid",
            };

            roomService.updateRoom.mockResolvedValue(roomFixture);

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(roomService.updateRoom).toHaveBeenCalledWith({
                roomId: roomFixture.id,
                hostId: authenticatedUser.id,
                data: req.body,
            });
        });

        it("deve retornar 400 quando os dados forem inválidos", async () => {
            roomService.updateRoom.mockRejectedValue(
                new InvalidRoomDataError("Dados inválidos.", {
                    maxPlayers: "Quantidade inválida.",
                }),
            );

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                message: "Dados inválidos.",
                errors: {
                    maxPlayers: "Quantidade inválida.",
                },
            });
        });

        it("deve retornar 404 quando a sala não existir", async () => {
            roomService.updateRoom.mockRejectedValue(
                new RoomNotFoundError(),
            );

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                message: "Sala não encontrada.",
            });
        });

        it("deve retornar 403 quando o usuário não for o host", async () => {
            roomService.updateRoom.mockRejectedValue(
                new RoomAccessDeniedError(),
            );

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({
                message: "Você não tem permissão para alterar esta sala.",
            });
        });

        it("deve retornar 409 quando a sala não puder mais ser editada", async () => {
            roomService.updateRoom.mockRejectedValue(
                new RoomNotEditableError(),
            );

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith({
                message: "As configurações desta sala não podem mais ser alteradas.",
            });
        });

        it("deve retornar 500 quando ocorrer um erro inesperado", async () => {
            const consoleSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => { });

            roomService.updateRoom.mockRejectedValue(
                new Error("Erro inesperado no banco"),
            );

            await controller.update(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                message: "Erro interno ao atualizar sala.",
            });
            expect(consoleSpy).toHaveBeenCalled();
        });
    });


    describe("start", () => {
        it("deve retornar 401 quando não houver usuário autenticado", async () => {
            req.user = undefined as unknown as AuthenticatedRequest["user"];

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(roomService.startRoom).not.toHaveBeenCalled();
        });

        it("deve retornar 400 quando o identificador da sala for inválido", async () => {
            req.params = {} as Request["params"];

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(roomService.startRoom).not.toHaveBeenCalled();
        });

        it("deve iniciar a partida e retornar 200", async () => {
            const startedRoom = {
                ...roomFixture,
                status: "IN_PROGRESS",
            };

            roomService.startRoom.mockResolvedValue(startedRoom);

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(roomService.startRoom).toHaveBeenCalledWith(
                roomFixture.id,
                authenticatedUser.id,
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(startedRoom);
        });

        it("deve retornar 404 quando a sala não existir", async () => {
            roomService.startRoom.mockRejectedValue(
                new RoomNotFoundError(),
            );

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("deve retornar 403 quando o usuário não for o host", async () => {
            roomService.startRoom.mockRejectedValue(
                new RoomAccessDeniedError(),
            );

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("deve retornar 409 quando a sala já tiver sido iniciada", async () => {
            roomService.startRoom.mockRejectedValue(
                new RoomNotEditableError(),
            );

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 409 quando não houver jogadores suficientes", async () => {
            roomService.startRoom.mockRejectedValue(
                new RoomStartRequirementsError("NOT_ENOUGH_PLAYERS"),
            );

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 409 quando não houver perguntas suficientes", async () => {
            roomService.startRoom.mockRejectedValue(
                new RoomStartRequirementsError("NOT_ENOUGH_QUESTIONS"),
            );

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(409);
        });

        it("deve retornar 500 quando ocorrer um erro inesperado", async () => {
            const consoleSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => { });

            roomService.startRoom.mockRejectedValue(
                new Error("Erro inesperado no banco"),
            );

            await controller.start(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                message: "Erro interno ao iniciar partida.",
            });
            expect(consoleSpy).toHaveBeenCalled();
        });
    });


    describe("getLobby", () => {
        const lobbyFixture = {
            id: roomFixture.id,
            code: roomFixture.code,
            status: "WAITING",
            gameMode: "CLASSIC",
            maxPlayers: 10,
            questionTime: 30,
            createdAt: new Date("2026-11-16T00:00:00.000Z"),
            host: {
                id: authenticatedUser.id,
                name: "HostTeste",
            },
            players: [
                {
                    id: "player-test-uuid",
                    nickname: "JogadorTeste",
                    score: 0,
                    joinedAt: new Date("2026-11-16T00:01:00.000Z"),
                },
            ],
        };

        beforeEach(() => {
            req.params = { code: "ABC123" };
            req.headers = {
                authorization: "Bearer token-de-teste",
            } as Request["headers"];
        });

        it.each([
            { code: "ABC" },
            { code: "ABC12" },
            { code: "ABC1234" },
            { code: "ABC@23" },
            { code: "   " },
        ])("deve retornar 400 quando o código da sala for inválido ('$code')", async ({ code }) => {
            req.params = { code };

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(400);
            expect(roomService.getRoomLobby).not.toHaveBeenCalled();
        });

        it("deve normalizar código com espaços e letras minúsculas ao consultar o lobby", async () => {
            req.params = { code: " abc 123 " };
            roomService.getRoomLobby.mockResolvedValue(lobbyFixture);

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(roomService.getRoomLobby).toHaveBeenCalledWith(
                "ABC123",
                "token-de-teste",
            );
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("deve retornar 401 quando não houver credencial", async () => {
            req.headers = {} as Request["headers"];

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(roomService.getRoomLobby).not.toHaveBeenCalled();
        });

        it("deve retornar 401 quando o token estiver vazio", async () => {
            req.headers = {
                authorization: "Bearer ",
            } as Request["headers"];

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
            expect(roomService.getRoomLobby).not.toHaveBeenCalled();
        });

        it("deve consultar o lobby e retornar 200", async () => {
            roomService.getRoomLobby.mockResolvedValue(lobbyFixture);

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(roomService.getRoomLobby).toHaveBeenCalledWith(
                "ABC123",
                "token-de-teste",
            );

            expect(res.status).toHaveBeenCalledWith(200);

            expect(res.json).toHaveBeenCalledWith({
                room: {
                    ...lobbyFixture,
                    playerCount: 1,
                },
            });
        });

        it("deve retornar 401 quando o serviço rejeitar a autenticação", async () => {
            roomService.getRoomLobby.mockRejectedValue(
                new RoomAuthenticationError(),
            );

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("deve retornar 403 quando o usuário não tiver acesso à sala", async () => {
            roomService.getRoomLobby.mockRejectedValue(
                new RoomAccessDeniedError(),
            );

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("deve retornar 404 quando a sala não existir", async () => {
            roomService.getRoomLobby.mockRejectedValue(
                new RoomNotFoundError(),
            );

            await controller.getLobby(
                req as Request,
                res as unknown as Response,
            );

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });
});
