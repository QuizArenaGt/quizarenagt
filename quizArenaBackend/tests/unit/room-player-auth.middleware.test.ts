import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findBySessionTokenHashMock } = vi.hoisted(() => ({
    findBySessionTokenHashMock: vi.fn(),
}));

vi.mock("../../src/rooms/room-player.repository.js", () => ({
    RoomPlayerRepository: class {
        findBySessionTokenHash = findBySessionTokenHashMock;
    },
}));

import { authenticateRoomPlayer } from "../../src/rooms/room-player-auth.middleware.js";

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

describe("authenticateRoomPlayer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("deve autenticar participante da partida atual ativa e anexar roomId", async () => {
        findBySessionTokenHashMock.mockResolvedValue({
            id: "gp-1",
            gameId: "game-2",
            userId: null,
            nickname: "Alice",
            sessionTokenHash: "hash-1",
            score: 0,
            joinedAt: new Date("2026-11-18T12:00:00.000Z"),
            game: {
                id: "game-2",
                roomId: "room-1",
                status: "IN_PROGRESS",
                room: {
                    id: "room-1",
                    status: "ACTIVE",
                    games: [
                        { id: "game-2", status: "IN_PROGRESS" },
                        { id: "game-1", status: "FINISHED" },
                    ],
                },
            },
        });

        const req = {
            headers: { authorization: "Bearer valid-player-token" },
        } as unknown as Request;
        const res = createResponseMock();
        const next = vi.fn() as unknown as NextFunction;

        await authenticateRoomPlayer(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.roomPlayer).toMatchObject({
            id: "gp-1",
            gameId: "game-2",
            roomId: "room-1",
        });
    });

    it("deve rejeitar com 401 token de GamePlayer pertencente a partida anterior", async () => {
        findBySessionTokenHashMock.mockResolvedValue({
            id: "gp-old",
            gameId: "game-1",
            userId: null,
            nickname: "Alice",
            sessionTokenHash: "hash-old",
            score: 100,
            joinedAt: new Date("2026-11-18T11:00:00.000Z"),
            game: {
                id: "game-1",
                roomId: "room-1",
                status: "FINISHED",
                room: {
                    id: "room-1",
                    status: "ACTIVE",
                    games: [
                        { id: "game-2", status: "WAITING" },
                        { id: "game-1", status: "FINISHED" },
                    ],
                },
            },
        });

        const req = {
            headers: { authorization: "Bearer old-game-token" },
        } as unknown as Request;
        const res = createResponseMock();
        const next = vi.fn() as unknown as NextFunction;

        await authenticateRoomPlayer(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });

    it("deve rejeitar com 401 participante cuja sala foi arquivada", async () => {
        findBySessionTokenHashMock.mockResolvedValue({
            id: "gp-1",
            gameId: "game-1",
            userId: null,
            nickname: "Alice",
            sessionTokenHash: "hash-1",
            score: 0,
            joinedAt: new Date("2026-11-18T12:00:00.000Z"),
            game: {
                id: "game-1",
                roomId: "room-1",
                status: "WAITING",
                room: {
                    id: "room-1",
                    status: "ARCHIVED",
                    games: [{ id: "game-1", status: "WAITING" }],
                },
            },
        });

        const req = {
            headers: { authorization: "Bearer token" },
        } as unknown as Request;
        const res = createResponseMock();
        const next = vi.fn() as unknown as NextFunction;

        await authenticateRoomPlayer(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});
