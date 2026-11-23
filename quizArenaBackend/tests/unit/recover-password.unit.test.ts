import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { validateRecoverPassword } from "../../src/auth/recover.dto.js";
import { validateResetPassword } from "../../src/auth/reset.dto.js";
import { RecoverPasswordService } from "../../src/auth/recoverPasswordService.js";
import { createRateLimiter } from "../../src/auth/rate-limit.middleware.js";
import {
    EmailNotConfiguredError,
    isEmailConfigured,
    resolveEmailConfig,
} from "../../src/email/emailConfig.js";
import {
    EmailService,
    escapeHtml,
    resolvePrimaryFrontendUrl,
} from "../../src/email/emailService.js";

describe("Recover & Reset Password DTOs", () => {
    it("validateRecoverPassword rejeita corpo inválido e e-mail inválido usando Record<string, string>", () => {
        expect(validateRecoverPassword(null)).toEqual({
            success: false,
            errors: { body: "O corpo da requisição deve ser um objeto." },
        });
        expect(validateRecoverPassword([])).toEqual({
            success: false,
            errors: { body: "O corpo da requisição deve ser um objeto." },
        });
        expect(validateRecoverPassword({ email: "   " })).toEqual({
            success: false,
            errors: { email: "O e-mail é obrigatório." },
        });
        expect(validateRecoverPassword({ email: "invalido@" })).toEqual({
            success: false,
            errors: { email: "Informe um e-mail válido." },
        });
        expect(validateRecoverPassword({ email: "  User@Example.COM " })).toEqual({
            success: true,
            data: { email: "user@example.com" },
        });
    });

    it("validateResetPassword exige token, mínimo de 8 caracteres e máximo de 72 bytes UTF-8", () => {
        expect(validateResetPassword(null)).toEqual({
            success: false,
            errors: { body: "O corpo da requisição deve ser um objeto." },
        });
        expect(
            validateResetPassword({ token: "   ", newPassword: "short" }),
        ).toEqual({
            success: false,
            errors: {
                token: "Token de recuperação inválido.",
                newPassword: "A senha deve possuir pelo menos 8 caracteres.",
            },
        });

        // 72 bytes exatos devem ser aceitos
        const exact72 = "a".repeat(72);
        expect(
            validateResetPassword({ token: "tok-123", newPassword: exact72 }),
        ).toEqual({
            success: true,
            data: { token: "tok-123", newPassword: exact72 },
        });

        // 73 bytes (ou caracteres multibyte > 72 bytes) devem ser rejeitados
        const tooManyBytes = "🔒".repeat(19); // 19 chars, 76 bytes UTF-8
        const overResult = validateResetPassword({
            token: "tok-123",
            newPassword: tooManyBytes,
        });
        expect(overResult.success).toBe(false);
        if (!overResult.success) {
            expect(overResult.errors.newPassword).toMatch(/72/);
        }
    });
});

describe("EmailConfig, EmailService & Segurança de HTML/URL", () => {
    const savedEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...savedEnv };
    });

    it("não lança erro quando SMTP não está configurado até o envio real ser solicitado", () => {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
        delete process.env.SMTP_PASSWORD;
        delete process.env.SMTP_FROM;

        expect(isEmailConfigured()).toBe(false);
        expect(() => resolveEmailConfig()).toThrow(EmailNotConfiguredError);
        expect(() => new EmailService()).not.toThrow();
    });

    it("resolvePrimaryFrontendUrl usa a primeira URL válida mesmo com múltiplas origens CORS", () => {
        expect(
            resolvePrimaryFrontendUrl(
                " https://app.quizarena.dev/ , http://localhost:5173 ",
            ),
        ).toBe("https://app.quizarena.dev");
        expect(resolvePrimaryFrontendUrl(undefined)).toBe(
            "http://localhost:5173",
        );
    });

    it("escapa HTML no nome do usuário e usa config.from e FRONTEND_URL correta ao enviar", async () => {
        process.env.FRONTEND_URL =
            "https://quiz.example.com,http://localhost:5173";

        const sendMailMock = vi.fn().mockResolvedValue(undefined);
        const emailService = new EmailService({
            getConfig: () => ({
                host: "smtp.example.com",
                port: 587,
                secure: false,
                auth: { user: "smtp-user", pass: "smtp-pass" },
                from: "QuizArena <noreply@quiz.example.com>",
            }),
            createTransporter: () => ({ sendMail: sendMailMock }),
        });

        await emailService.sendPasswordResetEmail({
            to: "user@example.com",
            name: `<script>alert("xss")</script> & "Prof"`,
            resetToken: "abc+token/1",
            expiresInMinutes: 15,
        });

        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const mailArg = sendMailMock.mock.calls[0]?.[0] as {
            from: string;
            to: string;
            html: string;
            text: string;
        };
        expect(mailArg.from).toBe("QuizArena <noreply@quiz.example.com>");
        expect(mailArg.to).toBe("user@example.com");
        expect(mailArg.html).not.toContain("<script>");
        expect(mailArg.html).toContain(
            escapeHtml(`<script>alert("xss")</script> & "Prof"`),
        );
        expect(mailArg.html).toContain(
            "https://quiz.example.com/reset-password?token=abc%2Btoken%2F1",
        );
        expect(mailArg.html).not.toContain("localhost:5173");
    });
});

describe("RecoverPasswordService (regras de token e rollback SMTP)", () => {
    it("não cria token nem envia e-mail quando usuário não existe", async () => {
        const userService = { findByEmail: vi.fn().mockResolvedValue(null) };
        const emailService = { sendPasswordResetEmail: vi.fn() };
        const tokenRepo = {
            replaceForUser: vi.fn(),
            deleteByTokenHash: vi.fn(),
            findByTokenHash: vi.fn(),
            consume: vi.fn(),
        };

        const service = new RecoverPasswordService(
            userService as never,
            emailService as never,
            tokenRepo as never,
        );

        await service.requestPasswordReset("naoexiste@example.com");

        expect(tokenRepo.replaceForUser).not.toHaveBeenCalled();
        expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("faz rollback do token gerado se o envio SMTP falhar", async () => {
        const userService = {
            findByEmail: vi.fn().mockResolvedValue({
                id: "user-1",
                email: "user@example.com",
                name: "Alice",
            }),
        };
        const emailService = {
            sendPasswordResetEmail: vi
                .fn()
                .mockRejectedValue(new Error("SMTP connection refused")),
        };
        const tokenRepo = {
            replaceForUser: vi.fn().mockResolvedValue({ id: "tok-row-1" }),
            deleteByTokenHash: vi.fn().mockResolvedValue(undefined),
            findByTokenHash: vi.fn(),
            consume: vi.fn(),
        };

        const service = new RecoverPasswordService(
            userService as never,
            emailService as never,
            tokenRepo as never,
        );

        await expect(
            service.requestPasswordReset("user@example.com"),
        ).rejects.toThrow("SMTP connection refused");

        expect(tokenRepo.replaceForUser).toHaveBeenCalledTimes(1);
        const savedTokenHash = (
            tokenRepo.replaceForUser.mock.calls[0]?.[0] as {
                tokenHash: string;
            }
        ).tokenHash;
        const sentRawToken = (
            emailService.sendPasswordResetEmail.mock.calls[0]?.[0] as {
                resetToken: string;
            }
        ).resetToken;

        expect(savedTokenHash).toBe(
            createHash("sha256").update(sentRawToken).digest("hex"),
        );
        expect(tokenRepo.deleteByTokenHash).toHaveBeenCalledWith(
            savedTokenHash,
        );
    });

    it("rejeita token expirado ou já consumido em resetPassword", async () => {
        const userService = { findByEmail: vi.fn() };
        const emailService = { sendPasswordResetEmail: vi.fn() };
        const tokenRepo = {
            replaceForUser: vi.fn(),
            deleteByTokenHash: vi.fn(),
            findByTokenHash: vi
                .fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({
                    id: "t1",
                    tokenHash: "h1",
                    userId: "u1",
                    expiresAt: new Date(Date.now() - 1000),
                })
                .mockResolvedValueOnce({
                    id: "t2",
                    tokenHash: "h2",
                    userId: "u1",
                    expiresAt: new Date(Date.now() + 60_000),
                }),
            consume: vi.fn().mockResolvedValueOnce(false),
        };

        const service = new RecoverPasswordService(
            userService as never,
            emailService as never,
            tokenRepo as never,
        );

        await expect(
            service.resetPassword("missing", "NovaSenha123"),
        ).rejects.toThrow("Token inválido ou expirado.");

        await expect(
            service.resetPassword("expired", "NovaSenha123"),
        ).rejects.toThrow("Token inválido ou expirado.");

        await expect(
            service.resetPassword("race-lost", "NovaSenha123"),
        ).rejects.toThrow("Token inválido ou expirado.");
    });

    it("resetPassword conclui normalmente e registra log se desconexão de sockets falhar após consume", async () => {
        const callOrder: string[] = [];
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        const service = new RecoverPasswordService(
            { findByEmail: vi.fn() } as never,
            { sendPasswordResetEmail: vi.fn() } as never,
            {
                findByTokenHash: vi.fn().mockResolvedValue({
                    id: "tok-ok",
                    userId: "user-reset-1",
                    tokenHash: "h",
                    expiresAt: new Date(Date.now() + 60_000),
                    createdAt: new Date(),
                }),
                deleteByTokenHash: vi.fn(),
                replaceForUser: vi.fn(),
                consume: vi.fn(async () => {
                    callOrder.push("db-consume");
                    return true;
                }),
            } as never,
            async () => {
                callOrder.push("disconnect-sockets");
                throw new Error("Falha simulada ao fechar sockets");
            },
        );

        await expect(
            service.resetPassword("valid-token", "NovaSenha123"),
        ).resolves.toBeUndefined();

        expect(callOrder).toEqual(["db-consume", "disconnect-sockets"]);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Falha ao encerrar conexões Socket.IO após atualização de senha:",
            "Falha simulada ao fechar sockets",
        );

        consoleErrorSpy.mockRestore();
    });
});

describe("createRateLimiter middleware", () => {
    it("permite até maxRequests e bloqueia excedente com 429 e Retry-After", () => {
        const limiter = createRateLimiter({
            windowMs: 60_000,
            maxRequests: 2,
            message: "Limite atingido.",
        });

        const req = { ip: "10.0.0.1" } as unknown as Request;
        const makeRes = () => {
            const headers: Record<string, string> = {};
            return {
                headers,
                setHeader: vi.fn((k: string, v: string) => {
                    headers[k] = v;
                }),
                status: vi.fn().mockReturnThis(),
                json: vi.fn().mockReturnThis(),
            };
        };

        const next1 = vi.fn();
        limiter.middleware(req, makeRes() as unknown as Response, next1);
        expect(next1).toHaveBeenCalledTimes(1);

        const next2 = vi.fn();
        limiter.middleware(req, makeRes() as unknown as Response, next2);
        expect(next2).toHaveBeenCalledTimes(1);

        const next3 = vi.fn();
        const res3 = makeRes();
        limiter.middleware(req, res3 as unknown as Response, next3);
        expect(next3).not.toHaveBeenCalled();
        expect(res3.status).toHaveBeenCalledWith(429);
        expect(res3.json).toHaveBeenCalledWith({ message: "Limite atingido." });
        expect(Number(res3.headers["Retry-After"])).toBeGreaterThanOrEqual(1);

        limiter.reset();
        const nextAfterReset = vi.fn();
        limiter.middleware(
            req,
            makeRes() as unknown as Response,
            nextAfterReset,
        );
        expect(nextAfterReset).toHaveBeenCalledTimes(1);
    });
});
