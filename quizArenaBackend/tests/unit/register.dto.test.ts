
import { describe, expect, it } from "vitest";
import { validateRegisterUser } from "../../src/auth/register.dto.js";

describe("validateRegisterUser", () => {
    it("deve validar um cadastro correto e normalizar os dados", () => {
        const result = validateRegisterUser({
            name: "  João Silva  ",
            email: "  JOAO@EMAIL.COM  ",
            password: "Password1",
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data).toEqual({
                name: "João Silva",
                email: "joao@email.com",
                password: "Password1",
            });
        }
    });

    it.each([
        "gendesson@gmail.com",
        " gendesson@gmail.com",
        "gendesson@gmail.com ",
        "  Gendesson@gmail.com  ",
    ])("deve normalizar variações de espaços e maiúsculas no e-mail: %j", (rawEmail) => {
        const result = validateRegisterUser({
            name: "Gendesson",
            email: rawEmail,
            password: "abc12345",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.email).toBe("gendesson@gmail.com");
        }
    });

    it.each([
        "gen desson@gmail.com",
        "gendesson@gm ail.com",
        "email-invalido",
    ])("deve rejeitar e-mail inválido ou com espaços internos: %j", (invalidEmail) => {
        const result = validateRegisterUser({
            name: "Gendesson",
            email: invalidEmail,
            password: "abc12345",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.email).toBe("Informe um e-mail válido.");
        }
    });

    it("não deve aceitar corpo nulo", () => {
        const result = validateRegisterUser(null);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.body).toBeDefined();
        }
    });

    it("não deve aceitar corpo em formato de array", () => {
        const result = validateRegisterUser([]);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.body).toBeDefined();
        }
    });

    it("não deve aceitar nome vazio ou composto por espaços", () => {
        const result = validateRegisterUser({
            name: "   ",
            email: "joao@email.com",
            password: "12345678",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.name).toBeDefined();
        }
    });

    it("não deve aceitar e-mail vazio", () => {
        const result = validateRegisterUser({
            name: "João",
            email: "   ",
            password: "12345678",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.email).toBeDefined();
        }
    });

    it("não deve aceitar e-mail inválido", () => {
        const result = validateRegisterUser({
            name: "João",
            email: "email-invalido",
            password: "12345678",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.email).toBeDefined();
        }
    });

    it("não deve aceitar senha ausente", () => {
        const result = validateRegisterUser({
            name: "João",
            email: "joao@email.com",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.password).toBeDefined();
        }
    });

    it("não deve aceitar senha menor que oito caracteres", () => {
        const result = validateRegisterUser({
            name: "João",
            email: "joao@email.com",
            password: "abc1234",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.password).toBe(
                "A senha deve possuir pelo menos 8 caracteres.",
            );
        }
    });

    it("não deve aceitar senha sem letras", () => {
        const result = validateRegisterUser({
            name: "João",
            email: "joao@email.com",
            password: "12345678",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.password).toBe(
                "A senha deve conter pelo menos uma letra.",
            );
        }
    });

    it("não deve aceitar senha sem números", () => {
        const result = validateRegisterUser({
            name: "João",
            email: "joao@email.com",
            password: "abcdefgh",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.password).toBe(
                "A senha deve conter pelo menos um número.",
            );
        }
    });

    it.each([
        "abc12345",
        "abc123!@",
        " senha 1 ",
    ])("deve aceitar senha válida com letras e números sem exigir maiúscula/especial nem aplicar trim: %j", (validPassword) => {
        const result = validateRegisterUser({
            name: "João",
            email: "joao@email.com",
            password: validPassword,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.password).toBe(validPassword);
        }
    });

    it("deve retornar todos os erros quando os dados estiverem ausentes", () => {
        const result = validateRegisterUser({});

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.errors).toHaveProperty("name");
            expect(result.errors).toHaveProperty("email");
            expect(result.errors).toHaveProperty("password");
        }
    });
});
