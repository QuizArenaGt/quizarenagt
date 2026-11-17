
import type { RoomPlayer } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma.js";

type CreateRoomPlayerData = {
    roomId: string;
    userId?: string | null;
    nickname: string;
    sessionTokenHash: string;
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

    async countByRoomId(roomId: string): Promise<number> {
        return prisma.roomPlayer.count({
            where: { roomId },
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

    async findBySessionTokenHash(
        sessionTokenHash: string,
    ): Promise<RoomPlayer | null> {
        return prisma.roomPlayer.findUnique({
            where: { sessionTokenHash },
        });
    }

    async createIfRoomHasCapacity(
        data: CreateRoomPlayerData,
    ): Promise<RoomPlayer> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${data.roomId}
                FOR UPDATE
            `;

            const room = await tx.room.findUnique({
                where: { id: data.roomId },
            });

            if (!room) {
                throw new Error("ROOM_NOT_FOUND");
            }

            if (room.status !== "WAITING") {
                throw new Error("ROOM_NOT_JOINABLE");
            }

            const existingPlayer = await tx.roomPlayer.findUnique({
                where: {
                    roomId_nickname: {
                        roomId: data.roomId,
                        nickname: data.nickname,
                    },
                },
            });

            if (existingPlayer) {
                throw new Error("DUPLICATE_NICKNAME");
            }

            const playerCount = await tx.roomPlayer.count({
                where: { roomId: data.roomId },
            });

            if (playerCount >= room.maxPlayers) {
                throw new Error("ROOM_FULL");
            }

            return tx.roomPlayer.create({
                data,
            });
        });
    }
}
