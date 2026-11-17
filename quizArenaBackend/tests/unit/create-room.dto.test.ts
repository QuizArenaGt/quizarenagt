
import { describe, expect, it } from "vitest";
import { GameMode } from "@prisma/client";
import { validateCreateRoom } from "../../src/rooms/create-room.dto.js";

describe("validateCreateRoom", () => {
    const validRoom = {
        maxPlayers: 10,
        questionTime: 30,
    };

    it("deve aceitar dados válidos de criação de sala", () => {
        const result = validateCreateRoom({
            ...validRoom,
            gameMode: GameMode.CLASSIC,
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data).toEqual({
                maxPlayers: 10,
                questionTime: 30,
                gameMode: GameMode.CLASSIC,
            });
        }
    });

    it("deve definir CLASSIC como modo padrão quando gameMode não for informado", () => {
        const result = validateCreateRoom(validRoom);

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data.gameMode).toBe(GameMode.CLASSIC);
        }
    });

    it("deve aceitar o modo HARDCORE", () => {
        const result = validateCreateRoom({
            ...validRoom,
            gameMode: GameMode.HARDCORE,
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data.gameMode).toBe(GameMode.HARDCORE);
        }
    });

    it.each([null, [], "texto", 123, undefined])(
        "deve rejeitar corpo inválido: %s",
        (body) => {
            const result = validateCreateRoom(body);
            expect(result.success).toBe(false);
        },
    );

    it("deve rejeitar maxPlayers ausente", () => {
        const result = validateCreateRoom({
            questionTime: 30,
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors).toHaveProperty("maxPlayers");
        }
    });

    it.each([1, 0, 51, -1, 2.5, "10", null])(
        "deve rejeitar maxPlayers inválido: %s",
        (maxPlayers) => {
            const result = validateCreateRoom({
                maxPlayers,
                questionTime: 30,
            });

            expect(result.success).toBe(false);

            if (!result.success) {
                expect(result.errors).toHaveProperty("maxPlayers");
            }
        },
    );

    it.each([2, 50])(
        "deve aceitar maxPlayers no limite: %s",
        (maxPlayers) => {
            const result = validateCreateRoom({
                maxPlayers,
                questionTime: 30,
            });

            expect(result.success).toBe(true);
        },
    );

    it("deve rejeitar questionTime ausente", () => {
        const result = validateCreateRoom({
            maxPlayers: 10,
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors).toHaveProperty("questionTime");
        }
    });

    it.each([4, 181, 0, -1, 5.5, "30", null])(
        "deve rejeitar questionTime inválido: %s",
        (questionTime) => {
            const result = validateCreateRoom({
                maxPlayers: 10,
                questionTime,
            });

            expect(result.success).toBe(false);

            if (!result.success) {
                expect(result.errors).toHaveProperty("questionTime");
            }
        },
    );

    it.each([5, 180])(
        "deve aceitar questionTime no limite: %s",
        (questionTime) => {
            const result = validateCreateRoom({
                maxPlayers: 10,
                questionTime,
            });

            expect(result.success).toBe(true);
        },
    );

    it("deve rejeitar gameMode inválido", () => {
        const result = validateCreateRoom({
            ...validRoom,
            gameMode: "INVALID",
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors).toHaveProperty("gameMode");
        }
    });

    it("deve retornar erros de todos os campos inválidos", () => {
        const result = validateCreateRoom({
            maxPlayers: 1,
            questionTime: 200,
            gameMode: "INVALID",
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors).toHaveProperty("maxPlayers");
            expect(result.errors).toHaveProperty("questionTime");
            expect(result.errors).toHaveProperty("gameMode");
        }
    });
});
