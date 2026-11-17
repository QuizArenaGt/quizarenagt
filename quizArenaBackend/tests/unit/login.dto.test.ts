
import { describe, expect, it } from "vitest";
import { validateLogin } from "../../src/auth/login.dto.js";

describe("validateLogin", () => {
    it("deve aceitar credenciais válidas", () => {
        const result = validateLogin({
            email: "joao@email.com",
            password: "123",
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data).toEqual({
                email: "joao@email.com",
                password: "123",
            });
        }
    });

    it("deve normalizar o e-mail", () => {
        const result = validateLogin({
            email: "  JOAO@EMAIL.COM  ",
            password: "Senha123",
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data.email).toBe("joao@email.com");
        }
    });

    it.each([null, [], "texto", 123])(
        "deve rejeitar corpo inválido: %s",
        (body) => {
            const result = validateLogin(body);
            expect(result.success).toBe(false);
        },
    );

    it("deve rejeitar e-mail ausente", () => {
        const result = validateLogin({
            password: "Senha123",
        });

        expect(result.success).toBe(false);
    });

    it("deve rejeitar e-mail inválido", () => {
        const result = validateLogin({
            email: "email-invalido",
            password: "Senha123",
        });

        expect(result.success).toBe(false);
    });

    it("deve rejeitar senha ausente", () => {
        const result = validateLogin({
            email: "joao@email.com",
        });

        expect(result.success).toBe(false);
    });

    it("deve rejeitar senha vazia", () => {
        const result = validateLogin({
            email: "joao@email.com",
            password: "",
        });

        expect(result.success).toBe(false);
    });

    it("deve retornar os erros de e-mail e senha simultaneamente", () => {
        const result = validateLogin({
            email: "invalido",
            password: "",
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors).toHaveProperty("email");
            expect(result.errors).toHaveProperty("password");
        }
    });
});
