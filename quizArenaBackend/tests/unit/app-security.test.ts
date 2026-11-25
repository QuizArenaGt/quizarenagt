import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("App global JSON and error handling", () => {
    it("retorna JSON 400 estruturado para JSON malformado sem vazar stack trace HTML", async () => {
        const res = await request(app)
            .post("/auth/login")
            .set("Content-Type", "application/json")
            .send('{"email": ');

        expect(res.status).toBe(400);
        expect(res.headers["content-type"]).toMatch(/application\/json/);
        expect(res.body).toEqual({
            message: "Corpo da requisição JSON inválido.",
        });
    });

    it("rejeita corpo que não seja objeto JSON na criação de sala/pergunta", async () => {
        const res = await request(app).post("/rooms").send(["array"]);
        expect(res.status).toBe(401);
    });
});

describe("App healthcheck and proxy config", () => {
    it("configura trust proxy para respeitar cabeçalhos de proxy reverso", () => {
        expect(app.get("trust proxy")).toBe(1);
    });

    it("GET /health retorna 200 sem consultar o banco por padrão", async () => {
        const querySpy = vi.spyOn(prisma, "$queryRaw");

        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.headers["x-server-time"]).toBeDefined();
        expect(res.body).toEqual({
            status: "ok",
            service: "quizarena-backend",
            clockCalibrated: expect.any(Boolean),
            uptimeSeconds: expect.any(Number),
        });
        expect(querySpy).not.toHaveBeenCalled();
    });

    it("GET /health?check=db retorna 200 com database up quando SELECT 1 responde", async () => {
        const querySpy = vi
            .spyOn(prisma, "$queryRaw")
            .mockResolvedValueOnce([{ "?column?": 1 }] as never);

        const res = await request(app).get("/health?check=db");

        expect(querySpy).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            status: "ok",
            database: "up",
            service: "quizarena-backend",
        });
    });

    it("GET /health?check=db retorna 503 com database down quando o banco falha", async () => {
        const querySpy = vi
            .spyOn(prisma, "$queryRaw")
            .mockRejectedValueOnce(new Error("Connection terminated"));

        const res = await request(app).get("/health?check=db");

        expect(querySpy).toHaveBeenCalledTimes(1);
        expect(res.status).toBe(503);
        expect(res.body).toMatchObject({
            status: "degraded",
            database: "down",
            service: "quizarena-backend",
        });
    });
});
