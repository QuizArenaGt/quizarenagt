import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "../../src/realtime/socket.server.js";

describe("parseAllowedOrigins", () => {
    it("deve retornar '*' quando FRONTEND_URL não estiver definida ou estiver vazia", () => {
        expect(parseAllowedOrigins(undefined)).toBe("*");
        expect(parseAllowedOrigins("")).toBe("*");
        expect(parseAllowedOrigins("   ,  ")).toBe("*");
    });

    it("deve remover espaços e barras finais das origens informadas", () => {
        expect(
            parseAllowedOrigins(" https://quizarenagt.vercel.app/ , https://preview.vercel.app/// "),
        ).toEqual([
            "https://quizarenagt.vercel.app",
            "https://preview.vercel.app",
        ]);
    });
});
