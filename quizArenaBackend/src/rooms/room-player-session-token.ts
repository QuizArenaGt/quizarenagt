import { createHash, randomBytes } from "node:crypto";

export function generateRoomPlayerSessionToken(): string {
    return randomBytes(32).toString("base64url");
}

export function hashRoomPlayerSessionToken(token: string): string {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}