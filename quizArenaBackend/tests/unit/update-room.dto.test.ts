
import { describe, expect, it } from "vitest";
import { GameMode } from "@prisma/client";
import { validateUpdateRoom } from "../../src/rooms/update-room.dto.js";

describe("validateUpdateRoom", () => {
    it("deve aceitar atualização somente de maxPlayers", () => {
        expect(validateUpdateRoom({
            maxPlayers: 20,
        })).toEqual({
            success: true,
            data: {
                maxPlayers: 20,
            },
        });
    });

    it("deve aceitar atualização somente de questionTime", () => {
        expect(validateUpdateRoom({
            questionTime: 60,
        })).toEqual({
            success: true,
            data: {
                questionTime: 60,
            },
        });
    });

    it("deve aceitar atualização somente de gameMode", () => {
        expect(validateUpdateRoom({
            gameMode: GameMode.HARDCORE,
        })).toEqual({
            success: true,
            data: {
                gameMode: GameMode.HARDCORE,
            },
        });
    });

    it("deve aceitar atualização de múltiplas configurações", () => {
        expect(validateUpdateRoom({
            maxPlayers: 20,
            questionTime: 60,
            gameMode: GameMode.HARDCORE,
        })).toEqual({
            success: true,
            data: {
                maxPlayers: 20,
                questionTime: 60,
                gameMode: GameMode.HARDCORE,
            },
        });
    });

    it("deve rejeitar corpo vazio", () => {
        const result = validateUpdateRoom({});

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors.body).toBeDefined();
        }
    });

    it("deve rejeitar corpo que não seja um objeto", () => {
        expect(validateUpdateRoom(null).success).toBe(false);
        expect(validateUpdateRoom([]).success).toBe(false);
        expect(validateUpdateRoom("invalid").success).toBe(false);
    });

    it("deve rejeitar quantidade de jogadores abaixo do mínimo", () => {
        expect(validateUpdateRoom({
            maxPlayers: 1,
        }).success).toBe(false);
    });

    it("deve rejeitar quantidade de jogadores acima do máximo", () => {
        expect(validateUpdateRoom({
            maxPlayers: 51,
        }).success).toBe(false);
    });

    it("deve rejeitar quantidade de jogadores não inteira", () => {
        expect(validateUpdateRoom({
            maxPlayers: 10.5,
        }).success).toBe(false);
    });

    it("deve rejeitar tempo por pergunta abaixo do mínimo", () => {
        expect(validateUpdateRoom({
            questionTime: 4,
        }).success).toBe(false);
    });

    it("deve rejeitar tempo por pergunta acima do máximo", () => {
        expect(validateUpdateRoom({
            questionTime: 181,
        }).success).toBe(false);
    });

    it("deve rejeitar tempo por pergunta não inteiro", () => {
        expect(validateUpdateRoom({
            questionTime: 30.5,
        }).success).toBe(false);
    });

    it("deve rejeitar modo de jogo inválido", () => {
        expect(validateUpdateRoom({
            gameMode: "INVALID",
        }).success).toBe(false);
    });

    it("deve ignorar campos não permitidos quando há configuração válida", () => {
        expect(validateUpdateRoom({
            maxPlayers: 20,
            hostId: "another-host",
            status: "FINISHED",
            code: "ABC123",
        })).toEqual({
            success: true,
            data: {
                maxPlayers: 20,
            },
        });
    });

    it("deve rejeitar corpo contendo somente campos não permitidos", () => {
        const result = validateUpdateRoom({
            hostId: "another-host",
            status: "FINISHED",
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors.body).toBeDefined();
        }
    });
});
