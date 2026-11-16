
import type {
    Room,
    GameMode,
    RoomStatus,
} from "@prisma/client";

import { prisma } from "../database/prisma.js";

type CreateRoomData = {
    code: string;
    hostId: string;
    maxPlayers: number;
    questionTime: number;
    gameMode?: GameMode;
};

type UpdateRoomData = {
    maxPlayers?: number;
    questionTime?: number;
    gameMode?: GameMode;
};

export class RoomRepository {
    async findById(id: string): Promise<Room | null> {
        return prisma.room.findUnique({
            where: { id },
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
                players: {
                    select: {
                        id: true,
                        nickname: true,
                        score: true,
                        joinedAt: true,
                    },
                    orderBy: {
                        joinedAt: "asc",
                    },
                },
            },
        });
    }

    async findManyByHostId(hostId: string): Promise<Room[]> {
        return prisma.room.findMany({
            where: { hostId },
            orderBy: { createdAt: "desc" },
        });
    }

    async create(data: CreateRoomData): Promise<Room> {
        return prisma.room.create({
            data,
        });
    }

    async update(
        id: string,
        data: UpdateRoomData,
    ): Promise<Room> {
        return prisma.room.update({
            where: { id },
            data,
        });
    }

    async updateStatus(
        id: string,
        status: RoomStatus,
    ): Promise<Room> {
        return prisma.room.update({
            where: { id },
            data: { status },
        });
    }
}
