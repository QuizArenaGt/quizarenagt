
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Room } from "@prisma/client";

import { RoomRepository } from "../../src/rooms/room.repository.js";
import { prisma } from "../../src/database/prisma.js";

vi.mock("../../src/database/prisma.js", () => ({
    prisma: {
        room: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

const roomModel = prisma.room as unknown as {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
};

const roomFixture = {
    id: "room-test-uuid",
    code: "ABC123",
    hostId: "host-test-uuid",
    maxPlayers: 10,
    questionTime: 30,
    gameMode: "CLASSIC",
    status: "WAITING",
    createdAt: new Date("2026-11-08T12:00:00.000Z"),
    updatedAt: new Date("2026-11-08T12:00:00.000Z"),
} satisfies Room;

const createRoomData = {
    code: "ABC123",
    hostId: "host-test-uuid",
    maxPlayers: 10,
    questionTime: 30,
    gameMode: "CLASSIC" as const,
};

describe("RoomRepository", () => {
    let repository: RoomRepository;

    beforeEach(() => {
        vi.clearAllMocks();
        repository = new RoomRepository();
    });

    describe("findById", () => {
        it("deve encontrar uma sala pelo ID", async () => {
            roomModel.findUnique.mockResolvedValue(roomFixture);

            const result = await repository.findById(roomFixture.id);

            expect(roomModel.findUnique).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
            });

            expect(result).toEqual(roomFixture);
        });

        it("deve retornar null quando a sala não existir", async () => {
            roomModel.findUnique.mockResolvedValue(null);

            const result = await repository.findById("invalid-id");

            expect(result).toBeNull();
        });
    });

    describe("findByCode", () => {
        it("deve encontrar uma sala pelo código", async () => {
            roomModel.findUnique.mockResolvedValue(roomFixture);

            const result = await repository.findByCode(roomFixture.code);

            expect(roomModel.findUnique).toHaveBeenCalledWith({
                where: { code: roomFixture.code },
            });

            expect(result).toEqual(roomFixture);
        });

        it("deve retornar null quando o código não existir", async () => {
            roomModel.findUnique.mockResolvedValue(null);

            const result = await repository.findByCode("INVALID");

            expect(result).toBeNull();
        });
    });

    describe("findManyByHostId", () => {
        it("deve listar as salas de um host ordenadas por data", async () => {
            roomModel.findMany.mockResolvedValue([roomFixture]);

            const result = await repository.findManyByHostId(
                roomFixture.hostId,
            );

            expect(roomModel.findMany).toHaveBeenCalledWith({
                where: { hostId: roomFixture.hostId },
                orderBy: { createdAt: "desc" },
            });

            expect(result).toEqual([roomFixture]);
        });

        it("deve retornar uma lista vazia quando o host não possuir salas", async () => {
            roomModel.findMany.mockResolvedValue([]);

            const result = await repository.findManyByHostId(
                roomFixture.hostId,
            );

            expect(result).toEqual([]);
        });
    });

    describe("create", () => {
        it("deve criar uma sala com as configurações informadas", async () => {
            roomModel.create.mockResolvedValue(roomFixture);

            const result = await repository.create(createRoomData);

            expect(roomModel.create).toHaveBeenCalledWith({
                data: createRoomData,
            });

            expect(result).toEqual(roomFixture);
        });
    });

    describe("update", () => {
        it("deve atualizar as configurações da sala", async () => {
            const updateData = {
                maxPlayers: 15,
                questionTime: 45,
            };

            const updatedRoom = {
                ...roomFixture,
                ...updateData,
            };

            roomModel.update.mockResolvedValue(updatedRoom);

            const result = await repository.update(
                roomFixture.id,
                updateData,
            );

            expect(roomModel.update).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
                data: updateData,
            });

            expect(result).toEqual(updatedRoom);
        });
    });

    describe("updateStatus", () => {
        it("deve atualizar o status da sala", async () => {
            const updatedRoom = {
                ...roomFixture,
                status: "IN_PROGRESS" as const,
            };

            roomModel.update.mockResolvedValue(updatedRoom);

            const result = await repository.updateStatus(
                roomFixture.id,
                "IN_PROGRESS",
            );

            expect(roomModel.update).toHaveBeenCalledWith({
                where: { id: roomFixture.id },
                data: { status: "IN_PROGRESS" },
            });

            expect(result).toEqual(updatedRoom);
        });
    });
});
