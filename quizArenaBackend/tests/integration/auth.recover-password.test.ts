import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import request from "supertest";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { app } from "../../src/app.js";
import { resetAuthRateLimiters } from "../../src/auth/rate-limit.middleware.js";
import { prisma } from "../../src/database/prisma.js";
import { EmailService } from "../../src/email/emailService.js";

const TEST_EMAIL = "recover.integration@email.com";
const OTHER_EMAIL = "recover.other@email.com";
const INITIAL_PASSWORD = "SenhaInicial123";
const NEW_PASSWORD = "NovaSenhaSegura456";

async function cleanTestUsers(): Promise<void> {
    await prisma.user.deleteMany({
        where: {
            email: {
                in: [TEST_EMAIL, OTHER_EMAIL],
            },
        },
    });
}

describe("POST /auth/recover-password & POST /auth/reset-password - Integração", () => {
    const savedEnv = { ...process.env };

    beforeAll(async () => {
        await prisma.$connect();
    });

    beforeEach(async () => {
        resetAuthRateLimiters();
        await cleanTestUsers();
        await prisma.user.create({
            data: {
                name: "Usuário Recuperação",
                email: TEST_EMAIL,
                password: await hash(INITIAL_PASSWORD, 12),
            },
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.env = { ...savedEnv };
    });

    afterAll(async () => {
        resetAuthRateLimiters();
        await cleanTestUsers();
        await prisma.$disconnect();
    });

    it("retorna 400 em dados inválidos com erros no formato padrão Record<string, string>", async () => {
        const recoverInvalid = await request(app)
            .post("/auth/recover-password")
            .send({ email: "email-invalido" });

        expect(recoverInvalid.status).toBe(400);
        expect(recoverInvalid.body.errors).toEqual({
            email: "Informe um e-mail válido.",
        });

        const resetInvalid = await request(app)
            .post("/auth/reset-password")
            .send({ token: "", newPassword: "123" });

        expect(resetInvalid.status).toBe(400);
        expect(resetInvalid.body.errors).toEqual({
            token: "Token de recuperação inválido.",
            newPassword: "A senha deve possuir pelo menos 8 caracteres.",
        });
    });

    it("retorna 200 genérico para e-mail inexistente sem vazar existência nem criar token", async () => {
        const emailSpy = vi
            .spyOn(EmailService.prototype, "sendPasswordResetEmail")
            .mockResolvedValue(undefined);

        const res = await request(app)
            .post("/auth/recover-password")
            .send({ email: "inexistente.agora@email.com" });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/se o e-mail estiver cadastrado/i);
        expect(emailSpy).not.toHaveBeenCalled();

        const count = await prisma.passwordResetToken.count();
        expect(count).toBe(0);
    });

    it("gera token hash SHA-256, substitui token anterior, redefine senha em uso único e permite login com nova senha", async () => {
        const capturedTokens: string[] = [];
        vi.spyOn(
            EmailService.prototype,
            "sendPasswordResetEmail",
        ).mockImplementation(async (params) => {
            capturedTokens.push(params.resetToken);
        });

        // 1. Primeira solicitação
        const firstRecover = await request(app)
            .post("/auth/recover-password")
            .send({ email: `  ${TEST_EMAIL.toUpperCase()} ` });

        expect(firstRecover.status).toBe(200);
        expect(capturedTokens).toHaveLength(1);
        const firstToken = capturedTokens[0]!;
        const firstHash = createHash("sha256").update(firstToken).digest("hex");

        const user = await prisma.user.findUniqueOrThrow({
            where: { email: TEST_EMAIL },
        });
        const tokensAfterFirst = await prisma.passwordResetToken.findMany({
            where: { userId: user.id },
        });
        expect(tokensAfterFirst).toHaveLength(1);
        expect(tokensAfterFirst[0]?.tokenHash).toBe(firstHash);
        expect(tokensAfterFirst[0]?.tokenHash).not.toBe(firstToken);

        // 2. Segunda solicitação deve invalidar/substituir o primeiro token
        const secondRecover = await request(app)
            .post("/auth/recover-password")
            .send({ email: TEST_EMAIL });

        expect(secondRecover.status).toBe(200);
        expect(capturedTokens).toHaveLength(2);
        const secondToken = capturedTokens[1]!;

        const tokensAfterSecond = await prisma.passwordResetToken.findMany({
            where: { userId: user.id },
        });
        expect(tokensAfterSecond).toHaveLength(1);

        // Token antigo não pode mais funcionar
        const oldTokenAttempt = await request(app)
            .post("/auth/reset-password")
            .send({ token: firstToken, newPassword: NEW_PASSWORD });
        expect(oldTokenAttempt.status).toBe(400);
        expect(oldTokenAttempt.body.message).toBe("Token inválido ou expirado.");

        // 3. Token atual redefine a senha com sucesso
        const resetRes = await request(app)
            .post("/auth/reset-password")
            .send({ token: secondToken, newPassword: NEW_PASSWORD });
        expect(resetRes.status).toBe(200);
        expect(resetRes.body.message).toBe("Senha redefinida com sucesso!");

        // 4. Token foi consumido (uso único)
        const reuseAttempt = await request(app)
            .post("/auth/reset-password")
            .send({ token: secondToken, newPassword: "OutraSenha999" });
        expect(reuseAttempt.status).toBe(400);
        expect(reuseAttempt.body.message).toBe("Token inválido ou expirado.");

        // 5. Senha antiga rejeitada e nova senha aceita no login
        const oldLogin = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
        expect(oldLogin.status).toBe(401);

        const newLogin = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: NEW_PASSWORD });
        expect(newLogin.status).toBe(200);
        expect(newLogin.body.token).toBeTypeOf("string");
    });

    it("rejeita token expirado no banco sem alterar a senha", async () => {
        const user = await prisma.user.findUniqueOrThrow({
            where: { email: TEST_EMAIL },
        });
        const rawToken = "expired-token-integration-123";
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");

        await prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt: new Date(Date.now() - 60_000),
            },
        });

        const resetRes = await request(app)
            .post("/auth/reset-password")
            .send({ token: rawToken, newPassword: NEW_PASSWORD });
        expect(resetRes.status).toBe(400);
        expect(resetRes.body.message).toBe("Token inválido ou expirado.");

        const oldLogin = await request(app)
            .post("/auth/login")
            .send({ email: TEST_EMAIL, password: INITIAL_PASSWORD });
        expect(oldLogin.status).toBe(200);
    });

    it("em falha SMTP ou ausência de config SMTP retorna 500 e faz rollback do token no banco", async () => {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASSWORD;
        delete process.env.SMTP_FROM;

        const user = await prisma.user.findUniqueOrThrow({
            where: { email: TEST_EMAIL },
        });

        const res = await request(app)
            .post("/auth/recover-password")
            .send({ email: TEST_EMAIL });

        expect(res.status).toBe(500);
        expect(res.body.message).toBe(
            "Erro interno ao solicitar recuperação de senha.",
        );

        const remainingTokens = await prisma.passwordResetToken.findMany({
            where: { userId: user.id },
        });
        expect(remainingTokens).toHaveLength(0);
    });

    it("aplica rate limiting contra abuso em /recover-password e /reset-password (429)", async () => {
        vi.spyOn(
            EmailService.prototype,
            "sendPasswordResetEmail",
        ).mockResolvedValue(undefined);

        for (let i = 0; i < 5; i += 1) {
            const okRes = await request(app)
                .post("/auth/recover-password")
                .send({ email: TEST_EMAIL });
            expect(okRes.status).toBe(200);
        }

        const blockedRecover = await request(app)
            .post("/auth/recover-password")
            .send({ email: TEST_EMAIL });
        expect(blockedRecover.status).toBe(429);
        expect(blockedRecover.headers["retry-after"]).toBeDefined();

        for (let i = 0; i < 10; i += 1) {
            const attempt = await request(app)
                .post("/auth/reset-password")
                .send({ token: "tok-x", newPassword: NEW_PASSWORD });
            expect(attempt.status).toBe(400);
        }

        const blockedReset = await request(app)
            .post("/auth/reset-password")
            .send({ token: "tok-x", newPassword: NEW_PASSWORD });
        expect(blockedReset.status).toBe(429);
    });
});
