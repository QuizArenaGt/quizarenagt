import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    createHttpCorsOptions,
    createSocketCorsOptions,
    parseAllowedOrigins,
} from "../../src/config/cors.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;

afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_FRONTEND_URL === undefined) {
        delete process.env.FRONTEND_URL;
    } else {
        process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
    }
    vi.resetModules();
});

describe("parseAllowedOrigins", () => {
    it("permite localhost e 127.0.0.1 em desenvolvimento quando FRONTEND_URL está ausente ou vazia (sem wildcard '*')", () => {
        for (const raw of [undefined, "", "   "]) {
            const origins = parseAllowedOrigins(raw, "development");

            expect(Array.isArray(origins)).toBe(true);
            expect(origins).not.toBe("*");

            const patterns = origins as RegExp[];
            expect(
                patterns.some((p) => p.test("http://localhost:5173")),
            ).toBe(true);
            expect(
                patterns.some((p) => p.test("http://127.0.0.1:4173")),
            ).toBe(true);
            expect(patterns.some((p) => p.test("https://localhost"))).toBe(
                true,
            );
            expect(patterns.some((p) => p.test("https://evil.com"))).toBe(
                false,
            );
            expect(
                patterns.some((p) => p.test("http://localhost.evil.com")),
            ).toBe(false);
        }
    });

    it("falha explicitamente em produção (NODE_ENV=production) quando FRONTEND_URL está ausente ou vazia", () => {
        for (const raw of [undefined, "", "   ", " , , "]) {
            expect(() => parseAllowedOrigins(raw, "production")).toThrow(
                /CORS|FRONTEND_URL/i,
            );
        }
    });

    it("normaliza múltiplas origens válidas removendo espaços, barras finais e duplicatas", () => {
        expect(
            parseAllowedOrigins(
                " https://quizarena.vercel.app/ , https://preview.quizarena.vercel.app/// , https://quizarena.vercel.app ",
                "production",
            ),
        ).toEqual([
            "https://quizarena.vercel.app",
            "https://preview.quizarena.vercel.app",
        ]);
    });

    it("rejeita wildcard '*', caminhos, query strings, fragmentos e URLs inválidas em produção e desenvolvimento", () => {
        const invalidValues = [
            "*",
            "https://*.vercel.app",
            "quizarena.vercel.app",
            "ftp://quizarena.vercel.app",
            "https://quizarena.vercel.app/login",
            "https://quizarena.vercel.app/app/",
            "https://quizarena.vercel.app?foo=bar",
            "https://quizarena.vercel.app/?",
            "https://quizarena.vercel.app#section",
            "https://quizarena.vercel.app/#",
            "https://user:pass@quizarena.vercel.app",
            "https://quizarena.vercel.app, *",
            ", ,",
        ];

        for (const invalid of invalidValues) {
            expect(() =>
                parseAllowedOrigins(invalid, "production"),
            ).toThrow();
            expect(() =>
                parseAllowedOrigins(invalid, "development"),
            ).toThrow();
        }
    });
});

describe("Paridade CORS entre HTTP e Socket.IO", () => {
    it("HTTP e Socket.IO recebem exatamente a mesma configuração de origens", () => {
        const env = {
            NODE_ENV: "production",
            FRONTEND_URL:
                " https://quizarena.vercel.app/ , https://staging.quizarena.vercel.app ",
        } as NodeJS.ProcessEnv;

        const httpCors = createHttpCorsOptions(env);
        const socketCors = createSocketCorsOptions(env);

        expect(httpCors.origin).toEqual([
            "https://quizarena.vercel.app",
            "https://staging.quizarena.vercel.app",
        ]);
        expect(socketCors.origin).toEqual(httpCors.origin);
        expect(httpCors.exposedHeaders).toEqual(["X-Server-Time"]);
        expect(socketCors.methods).toEqual(["GET", "POST"]);
    });

    it("inicialização de app.ts falha em produção sem FRONTEND_URL e bloqueia origens não autorizadas quando configurada", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.FRONTEND_URL;
        vi.resetModules();

        await expect(import("../../src/app.js")).rejects.toThrow(
            /FRONTEND_URL/i,
        );

        process.env.FRONTEND_URL =
            "https://quizarena.vercel.app/, https://preview.quizarena.vercel.app";
        vi.resetModules();

        const { app } = await import("../../src/app.js");

        const allowedRes = await request(app)
            .get("/health")
            .set("Origin", "https://quizarena.vercel.app");
        expect(allowedRes.status).toBe(200);
        expect(allowedRes.headers["access-control-allow-origin"]).toBe(
            "https://quizarena.vercel.app",
        );

        const blockedRes = await request(app)
            .get("/health")
            .set("Origin", "https://evil.example.com");
        expect(blockedRes.status).toBe(200);
        expect(
            blockedRes.headers["access-control-allow-origin"],
        ).toBeUndefined();
    });
});
