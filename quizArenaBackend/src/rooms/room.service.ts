import type { Room } from "@prisma/client";

import { RoomRepository } from "./room.repository.js";
import { RoomCodeGenerator } from "./room-code-generator.js";
import {
    validateCreateRoom,
    type CreateRoomDto,
} from "./create-room.dto.js";
import { InvalidRoomDataError } from "./room.errors.js";

type RoomRepositoryContract = Pick<
    RoomRepository,
    "create"
>;

type RoomCodeGeneratorContract = Pick<
    RoomCodeGenerator,
    "generate"
>;

export type CreateRoomInput = CreateRoomDto & {
    hostId: string;
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
}