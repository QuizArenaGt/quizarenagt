
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

    it.each([
        "gendesson@gmail.com",
        " gendesson@gmail.com",
        "gendesson@gmail.com ",
        "  Gendesson@gmail.com  ",
    ])("deve normalizar variações de espaços externos e maiúsculas no e-mail: %j", (rawEmail) => {
        const result = validateLogin({
            email: rawEmail,
            password: "Senha123",
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data.email).toBe("gendesson@gmail.com");
        }
    });

    it("não deve aplicar regras de força nem trim na senha durante o login", () => {
        const result = validateLogin({
            email: "joao@email.com",
            password: " 123 ",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.password).toBe(" 123 ");
        }
    });

    it.each([
        "gen desson@gmail.com",
        "gendesson@gm ail.com",
        "email-invalido",
    ])("deve rejeitar e-mail inválido ou com espaços internos: %j", (invalidEmail) => {
        const result = validateLogin({
            email: invalidEmail,
            password: "Senha123",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.email).toBe("Informe um e-mail válido.");
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
