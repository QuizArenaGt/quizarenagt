
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomPlayer } from "@prisma/client";

import { RoomPlayerRepository } from "../../src/rooms/room-player.repository.js";
import { prisma } from "../../src/database/prisma.js";

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        roomPlayer: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

const roomPlayerModel = prisma.roomPlayer as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
};

const roomPlayerFixture = {
    id: "room-player-test-uuid",
    roomId: "room-test-uuid",
    userId: "user-test-uuid",
    nickname: "Jogador 1",
    score: 0,
    joinedAt: new Date("2026-11-08T12:00:00.000Z"),
} satisfies RoomPlayer;

const createRoomPlayerData = {
    roomId: "room-test-uuid",
    userId: "user-test-uuid",
    nickname: "Jogador 1",
};

describe("RoomPlayerRepository", () => {
    let repository: RoomPlayerRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new RoomPlayerRepository();
    });

    describe("findById", () => {
        it("deve encontrar um participante pelo ID", async () => {
            roomPlayerModel.findUnique.mockResolvedValue(roomPlayerFixture);

            const result = await repository.findById(roomPlayerFixture.id);

            expect(roomPlayerModel.findUnique).toHaveBeenCalledWith({
                where: { id: roomPlayerFixture.id },
            });

            expect(result).toEqual(roomPlayerFixture);
        });

        it("deve retornar null quando o participante não existir", async () => {
            roomPlayerModel.findUnique.mockResolvedValue(null);

            const result = await repository.findById("invalid-id");

            expect(result).toBeNull();
        });
    });

    describe("findManyByRoomId", () => {
        it("deve listar os participantes da sala ordenados por entrada", async () => {
            roomPlayerModel.findMany.mockResolvedValue([roomPlayerFixture]);

            const result = await repository.findManyByRoomId(
                roomPlayerFixture.roomId,
            );

            expect(roomPlayerModel.findMany).toHaveBeenCalledWith({
                where: { roomId: roomPlayerFixture.roomId },
                orderBy: { joinedAt: "asc" },
            });

            expect(result).toEqual([roomPlayerFixture]);
        });

        it("deve retornar uma lista vazia quando a sala não possuir participantes", async () => {
            roomPlayerModel.findMany.mockResolvedValue([]);

            const result = await repository.findManyByRoomId(
                roomPlayerFixture.roomId,
            );

            expect(result).toEqual([]);
        });
    });

    describe("findByRoomAndUser", () => {
        it("deve encontrar um participante pelo ID da sala e do usuário", async () => {
            roomPlayerModel.findUnique.mockResolvedValue(roomPlayerFixture);

            const result = await repository.findByRoomAndUser(
                roomPlayerFixture.roomId,
                roomPlayerFixture.userId!,
            );

            expect(roomPlayerModel.findUnique).toHaveBeenCalledWith({
                where: {
                    roomId_userId: {
                        roomId: roomPlayerFixture.roomId,
                        userId: roomPlayerFixture.userId,
                    },
                },
            });

            expect(result).toEqual(roomPlayerFixture);
        });

        it("deve retornar null quando o usuário não estiver na sala", async () => {
            roomPlayerModel.findUnique.mockResolvedValue(null);

            const result = await repository.findByRoomAndUser(
                roomPlayerFixture.roomId,
                "invalid-user-id",
            );

            expect(result).toBeNull();
        });
    });

    describe("findByRoomAndNickname", () => {
        it("deve encontrar um participante pelo nickname dentro da sala", async () => {
            roomPlayerModel.findUnique.mockResolvedValue(roomPlayerFixture);

            const result = await repository.findByRoomAndNickname(
                roomPlayerFixture.roomId,
                roomPlayerFixture.nickname,
            );

            expect(roomPlayerModel.findUnique).toHaveBeenCalledWith({
                where: {
                    roomId_nickname: {
                        roomId: roomPlayerFixture.roomId,
                        nickname: roomPlayerFixture.nickname,
                    },
                },
            });

            expect(result).toEqual(roomPlayerFixture);
        });
    });

    describe("create", () => {
        it("deve cadastrar um participante na sala", async () => {
            roomPlayerModel.create.mockResolvedValue(roomPlayerFixture);

            const result = await repository.create(createRoomPlayerData);

            expect(roomPlayerModel.create).toHaveBeenCalledWith({
                data: createRoomPlayerData,
            });

            expect(result).toEqual(roomPlayerFixture);
        });
        it("deve cadastrar um participante anônimo na sala", async () => {
            const anonymousPlayer = {
                ...roomPlayerFixture,
                userId: null,
            };

            roomPlayerModel.create.mockResolvedValue(anonymousPlayer);

            const result = await repository.create({
                roomId: roomPlayerFixture.roomId,
                nickname: "Jogador Anônimo",
            });

            expect(roomPlayerModel.create).toHaveBeenCalledWith({
                data: {
                    roomId: roomPlayerFixture.roomId,
                    nickname: "Jogador Anônimo",
                },
            });

            expect(result).toEqual(anonymousPlayer);
        });
    });

    describe("delete", () => {
        it("deve remover um participante pelo ID", async () => {
            roomPlayerModel.delete.mockResolvedValue(roomPlayerFixture);

            const result = await repository.delete(roomPlayerFixture.id);

            expect(roomPlayerModel.delete).toHaveBeenCalledWith({
                where: { id: roomPlayerFixture.id },
            });

            expect(result).toEqual(roomPlayerFixture);
        });
    });
});
