import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoomCodeGenerator } from "../../src/rooms/room-code-generator.js";
import type { RoomRepository } from "../../src/rooms/room.repository.js";

type Repository = Pick<RoomRepository, "findByCode">;

describe("RoomCodeGenerator", () => {
    let repository: {
        findByCode: ReturnType<typeof vi.fn>;
    };
    let generator: RoomCodeGenerator;

    beforeEach(() => {
        repository = {
            findByCode: vi.fn(),
        };

        generator = new RoomCodeGenerator(repository as Repository);
    });

    it("deve gerar um código único com 6 caracteres alfanuméricos", async () => {
        repository.findByCode.mockResolvedValue(null);

        const code = await generator.generate();

        expect(code).toMatch(/^[A-Z0-9]{6}$/);
        expect(repository.findByCode).toHaveBeenCalledTimes(1);
        expect(repository.findByCode).toHaveBeenCalledWith(code);
    });

    it("deve gerar outro código quando encontrar uma colisão", async () => {
        repository.findByCode
            .mockResolvedValueOnce({ id: "existing-room" })
            .mockResolvedValueOnce(null);

        const code = await generator.generate();

        expect(code).toMatch(/^[A-Z0-9]{6}$/);
        expect(repository.findByCode).toHaveBeenCalledTimes(2);
    });

    it("deve interromper após 10 tentativas sem encontrar um código único", async () => {
        repository.findByCode.mockResolvedValue({
            id: "existing-room",
        });

        await expect(generator.generate()).rejects.toThrow(
            "Não foi possível gerar um código único para a sala.",
        );

        expect(repository.findByCode).toHaveBeenCalledTimes(10);
    });

    it("deve propagar erros inesperados do repositório", async () => {
        const databaseError = new Error("Falha de conexão com o banco");

        repository.findByCode.mockRejectedValue(databaseError);

        await expect(generator.generate()).rejects.toBe(databaseError);
    });
});
