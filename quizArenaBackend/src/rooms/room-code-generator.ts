import { randomInt } from "node:crypto";

import { RoomRepository } from "./room.repository.js";

type RoomRepositoryContract = Pick<
    RoomRepository,
    "findByCode"
>;

const CODE_LENGTH = 6;
const MAX_ATTEMPTS = 10;
const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export class RoomCodeGenerator {
    constructor(
        private readonly roomRepository: RoomRepositoryContract =
            new RoomRepository(),
    ) {}

    async generate(): Promise<string> {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const code = this.generateCandidate();
            const existingRoom =
                await this.roomRepository.findByCode(code);

            if (!existingRoom) {
                return code;
            }
        }

        throw new Error(
            "Não foi possível gerar um código único para a sala.",
        );
    }

    private generateCandidate(): string {
        return Array.from(
            { length: CODE_LENGTH },
            () => CHARACTERS[randomInt(CHARACTERS.length)],
        ).join("");
    }
}
