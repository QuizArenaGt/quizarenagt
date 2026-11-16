
import type { Room, RoomPlayer } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { RoomRepository } from "./room.repository.js";
import { RoomCodeGenerator } from "./room-code-generator.js";
import {
    validateCreateRoom,
    type CreateRoomDto,
} from "./create-room.dto.js";
import { validateUpdateRoom } from "./update-room.dto.js";
import { validateJoinRoom } from "./join-room.dto.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
    RoomNotJoinableError,
    RoomFullError,
    DuplicateNicknameError,
} from "./room.errors.js";
import { RoomPlayerRepository } from "./room-player.repository.js";
import {
    generateRoomPlayerSessionToken,
    hashRoomPlayerSessionToken,
} from "./room-player-session-token.js";

type RoomRepositoryContract = Pick<
    RoomRepository,
    "create" | "findById" | "findByCode" | "update"
>;

type RoomCodeGeneratorContract = Pick<
    RoomCodeGenerator,
    "generate"
>;

type RoomPlayerRepositoryContract = Pick<
    RoomPlayerRepository,
    "createIfRoomHasCapacity"
>;

export type CreateRoomInput = CreateRoomDto & {
    hostId: string;
};

export type UpdateRoomInput = {
    roomId: string;
    hostId: string;
    data: unknown;
};

export type JoinRoomResult = {
    player: Omit<RoomPlayer, "sessionTokenHash">;
    sessionToken: string;
};

function isNicknameUniqueConstraint(error: unknown): boolean {
    if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
    ) {
        return false;
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
        return (
            target.includes("roomId") &&
            target.includes("nickname")
        );
    }

    if (typeof target === "string") {
        return (
            target.includes("roomId") &&
            target.includes("nickname")
        );
    }

    return false;
}

export class RoomService {
    constructor(
        private readonly roomRepository: RoomRepositoryContract =
            new RoomRepository(),
        private readonly codeGenerator: RoomCodeGeneratorContract =
            new RoomCodeGenerator(),
        private readonly roomPlayerRepository: RoomPlayerRepositoryContract =
            new RoomPlayerRepository(),
    ) { }

    async createRoom(data: CreateRoomInput): Promise<Room> {
        const validation = validateCreateRoom(data);

        if (!validation.success) {
            throw new InvalidRoomDataError(
                "Dados da sala inválidos.",
                validation.errors,
            );
        }

        const code = await this.codeGenerator.generate();

        return this.roomRepository.create({
            code,
            hostId: data.hostId,
            maxPlayers: validation.data.maxPlayers,
            questionTime: validation.data.questionTime,
            gameMode: validation.data.gameMode,
        });
    }

    async updateRoom(data: UpdateRoomInput): Promise<Room> {
        const validation = validateUpdateRoom(data.data);

        if (!validation.success) {
            throw new InvalidRoomDataError(
                "Dados da sala inválidos.",
                validation.errors,
            );
        }

        const room = await this.roomRepository.findById(data.roomId);

        if (!room) {
            throw new RoomNotFoundError();
        }

        if (room.hostId !== data.hostId) {
            throw new RoomAccessDeniedError();
        }

        if (room.status !== "WAITING") {
            throw new RoomNotEditableError();
        }

        return this.roomRepository.update(
            room.id,
            validation.data,
        );
    }

    async joinRoom(data: unknown): Promise<JoinRoomResult> {
        const validation = validateJoinRoom(data);

        if (!validation.success) {
            throw new InvalidRoomDataError(
                "Dados para entrar na sala inválidos.",
                validation.errors,
            );
        }

        const { code, nickname } = validation.data;

        const room = await this.roomRepository.findByCode(code);

        if (!room) {
            throw new RoomNotFoundError();
        }

        const sessionToken = generateRoomPlayerSessionToken();
        const sessionTokenHash =
            hashRoomPlayerSessionToken(sessionToken);

        let createdPlayer: RoomPlayer;

        try {
            createdPlayer =
                await this.roomPlayerRepository.createIfRoomHasCapacity({
                    roomId: room.id,
                    nickname,
                    sessionTokenHash,
                });
        } catch (error) {
            if (error instanceof Error) {
                switch (error.message) {
                    case "ROOM_NOT_FOUND":
                        throw new RoomNotFoundError();

                    case "ROOM_NOT_JOINABLE":
                        throw new RoomNotJoinableError();

                    case "ROOM_FULL":
                        throw new RoomFullError();

                    case "DUPLICATE_NICKNAME":
                        throw new DuplicateNicknameError();
                }
            }

            if (isNicknameUniqueConstraint(error)) {
                throw new DuplicateNicknameError();
            }

            throw error;
        }

        const player: Omit<RoomPlayer, "sessionTokenHash"> = {
            id: createdPlayer.id,
            roomId: createdPlayer.roomId,
            userId: createdPlayer.userId,
            nickname: createdPlayer.nickname,
            score: createdPlayer.score,
            joinedAt: createdPlayer.joinedAt,
        };

        return {
            player,
            sessionToken,
        };
    }
}
