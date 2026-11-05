
import { describe, expect, it } from "vitest";
import { validateRegisterUser } from "../../src/auth/register.dto.js";

describe("validateRegisterUser", () => {
    it("deve validar um cadastro correto e normalizar os dados", () => {
        const result = validateRegisterUser({
            name: "  João Silva  ",
            email: "  JOAO@EMAIL.COM  ",
            password: "12345678",
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data).toEqual({
                name: "João Silva",
                email: "joao@email.com",
                password: "12345678",
            });
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
            password: "1234567",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.errors.password).toBeDefined();
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
