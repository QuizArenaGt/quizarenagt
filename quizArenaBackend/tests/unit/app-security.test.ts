import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

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
