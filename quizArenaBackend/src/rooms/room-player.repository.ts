
import type { RoomPlayer } from "@prisma/client";

import { prisma } from "../database/prisma.js";

type CreateRoomPlayerData = {
    roomId: string;
    userId?: string | null;
    nickname: string;
};

export class RoomPlayerRepository {
    async findById(id: string): Promise<RoomPlayer | null> {
        return prisma.roomPlayer.findUnique({
            where: { id },
        });
    }

    async findManyByRoomId(roomId: string): Promise<RoomPlayer[]> {
        return prisma.roomPlayer.findMany({
            where: { roomId },
            orderBy: { joinedAt: "asc" },
        });
    }

    async findByRoomAndUser(
        roomId: string,
        userId: string,
    ): Promise<RoomPlayer | null> {
        return prisma.roomPlayer.findUnique({
            where: {
                roomId_userId: {
                    roomId,
                    userId,
                },
            },
        });
    }

    async findByRoomAndNickname(
        roomId: string,
        nickname: string,
    ): Promise<RoomPlayer | null> {
        return prisma.roomPlayer.findUnique({
            where: {
                roomId_nickname: {
                    roomId,
                    nickname,
                },
            },
        });
    }

    async create(data: CreateRoomPlayerData): Promise<RoomPlayer> {
        return prisma.roomPlayer.create({
            data,
        });
    }

    async delete(id: string): Promise<RoomPlayer> {
        return prisma.roomPlayer.delete({
            where: { id },
        });
    }
}
