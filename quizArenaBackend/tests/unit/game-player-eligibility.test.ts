import { describe, expect, it } from "vitest";

import {
    countActiveGamePlayers,
    filterActiveGamePlayers,
    isGamePlayerActive,
} from "../../src/rooms/game-player-eligibility.js";

describe("game-player-eligibility", () => {
    it("isGamePlayerActive retorna true apenas para status ACTIVE", () => {
        expect(isGamePlayerActive({ status: "ACTIVE" })).toBe(true);
        expect(isGamePlayerActive({ status: "LEFT" })).toBe(false);
        expect(isGamePlayerActive({ status: "ABANDONED" })).toBe(false);
        expect(isGamePlayerActive({ status: null })).toBe(false);
        expect(isGamePlayerActive({})).toBe(false);
        expect(isGamePlayerActive(null)).toBe(false);
        expect(isGamePlayerActive(undefined)).toBe(false);
    });

    it("filterActiveGamePlayers e countActiveGamePlayers mantêm apenas participantes ACTIVE", () => {
        const players = [
            { id: "p-1", nickname: "Ana", status: "ACTIVE" as const },
            { id: "p-2", nickname: "Bia", status: "LEFT" as const },
            { id: "p-3", nickname: "Caio", status: "ABANDONED" as const },
            { id: "p-4", nickname: "Duda", status: "ACTIVE" as const },
        ];

        expect(filterActiveGamePlayers(players)).toEqual([
            { id: "p-1", nickname: "Ana", status: "ACTIVE" },
            { id: "p-4", nickname: "Duda", status: "ACTIVE" },
        ]);
        expect(countActiveGamePlayers(players)).toBe(2);
    });
});
