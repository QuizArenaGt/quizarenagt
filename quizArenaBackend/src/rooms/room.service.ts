
import type { Room } from "@prisma/client";

import { RoomRepository } from "./room.repository.js";
import { RoomCodeGenerator } from "./room-code-generator.js";
import {
    validateCreateRoom,
    type CreateRoomDto,
} from "./create-room.dto.js";
import {
    validateUpdateRoom,
} from "./update-room.dto.js";
import {
    InvalidRoomDataError,
    RoomNotFoundError,
    RoomAccessDeniedError,
    RoomNotEditableError,
} from "./room.errors.js";

type RoomRepositoryContract = Pick<
    RoomRepository,
    "create" | "findById" | "update"
>;

type RoomCodeGeneratorContract = Pick<
    RoomCodeGenerator,
    "generate"
>;

export type CreateRoomInput = CreateRoomDto & {
    hostId: string;
};

export type UpdateRoomInput = {
    roomId: string;
    hostId: string;
    data: unknown;
};

export class RoomService {
    constructor(
        private readonly roomRepository: RoomRepositoryContract =
            new RoomRepository(),
        private readonly codeGenerator: RoomCodeGeneratorContract =
            new RoomCodeGenerator(),
    ) {}

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
}
