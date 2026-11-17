import { describe, expect, it } from "vitest";

import {
    generateRoomPlayerSessionToken,
    hashRoomPlayerSessionToken,
} from "../../src/rooms/room-player-session-token.js";

describe("RoomPlayerSessionToken", () => {
    describe("generateRoomPlayerSessionToken", () => {
        it("deve gerar um token não vazio", () => {
            const token = generateRoomPlayerSessionToken();

            expect(token).toBeTruthy();
            expect(typeof token).toBe("string");
        });

        it("deve gerar tokens diferentes a cada chamada", () => {
            const firstToken = generateRoomPlayerSessionToken();
            const secondToken = generateRoomPlayerSessionToken();

            expect(firstToken).not.toBe(secondToken);
        });
    });

    describe("hashRoomPlayerSessionToken", () => {
        it("deve gerar o mesmo hash para o mesmo token", () => {
            const token = generateRoomPlayerSessionToken();

            const firstHash = hashRoomPlayerSessionToken(token);
            const secondHash = hashRoomPlayerSessionToken(token);

            expect(firstHash).toBe(secondHash);
        });

        it("deve gerar hashes diferentes para tokens diferentes", () => {
            const firstToken = generateRoomPlayerSessionToken();
            const secondToken = generateRoomPlayerSessionToken();

            expect(
                hashRoomPlayerSessionToken(firstToken),
            ).not.toBe(
                hashRoomPlayerSessionToken(secondToken),
            );
        });

        it("deve gerar um hash SHA-256 hexadecimal de 64 caracteres", () => {
            const hash = hashRoomPlayerSessionToken("token-de-teste");

            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });
    });
});