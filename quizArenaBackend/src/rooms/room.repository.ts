
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

export type StartRoomResult =
    | { success: true; room: Room }
    | {
        success: false;
        reason:
            | "ROOM_NOT_FOUND"
            | "ACCESS_DENIED"
            | "ROOM_NOT_WAITING"
            | "NOT_ENOUGH_PLAYERS"
            | "NOT_ENOUGH_QUESTIONS";
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

    async startIfReady(
        roomId: string,
        hostId: string,
    ): Promise<StartRoomResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`
                SELECT id
                FROM rooms
                WHERE id = ${roomId}
                FOR UPDATE
            `;

            const room = await tx.room.findUnique({
                where: { id: roomId },
            });

            if (!room) {
                return {
                    success: false,
                    reason: "ROOM_NOT_FOUND",
                };
            }

            if (room.hostId !== hostId) {
                return {
                    success: false,
                    reason: "ACCESS_DENIED",
                };
            }

            if (room.status !== "WAITING") {
                return {
                    success: false,
                    reason: "ROOM_NOT_WAITING",
                };
            }

            const playerCount = await tx.roomPlayer.count({
                where: { roomId },
            });

            if (playerCount < 2) {
                return {
                    success: false,
                    reason: "NOT_ENOUGH_PLAYERS",
                };
            }

            const questionCount = await tx.question.count({
                where: {
                    roomId,
                    isActive: true,
                },
            });

            if (questionCount < 5) {
                return {
                    success: false,
                    reason: "NOT_ENOUGH_QUESTIONS",
                };
            }

            const updatedRoom = await tx.room.update({
                where: { id: roomId },
                data: {
                    status: "IN_PROGRESS",
                },
            });

            return {
                success: true,
                room: updatedRoom,
            };
        });
    }
}
