
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { RoomController } from "../../src/rooms/room.controller.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
} from "../../src/rooms/room.errors.js";
import type { RoomService } from "../../src/rooms/room.service.js";

describe("RoomController", () => {
    let roomService: {
        createRoom: ReturnType<typeof vi.fn>;
        updateRoom: ReturnType<typeof vi.fn>;
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
});
