
import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { JwtService } from "../../src/auth/jwt.service.js";

const SECRET = "chave-de-teste-com-mais-de-32-caracteres";
const user = {
    id: "user-uuid-123",
    role: "USER" as const,
};

describe("JwtService", () => {
    it("deve gerar um token com identificação e perfil do usuário", () => {
        const service = new JwtService(SECRET);
        const token = service.generate(user);

        const decoded = jwt.verify(token, SECRET);

        expect(decoded).toMatchObject({
            sub: user.id,
            role: user.role,
        });
    });

    it("deve validar um token gerado pelo serviço", () => {
        const service = new JwtService(SECRET);
        const token = service.generate(user);

        const payload = service.verify(token);

        expect(payload.sub).toBe(user.id);
        expect(payload.role).toBe(user.role);
    });

    it("deve rejeitar token com assinatura inválida", () => {
        const service = new JwtService(SECRET);
        const token = jwt.sign(
            { role: "USER" },
            "outra-chave-com-mais-de-32-caracteres",
            { subject: user.id },
        );

        expect(() => service.verify(token)).toThrow();
    });

    it("deve rejeitar token expirado", () => {
        const service = new JwtService(SECRET, "0s");
        const token = service.generate(user);

        expect(() => service.verify(token)).toThrow();
    });

    it("deve rejeitar segredo ausente", () => {
        expect(() => new JwtService("")).toThrow();
    });

    it("deve rejeitar segredo muito curto", () => {
        expect(() => new JwtService("chave-curta")).toThrow();
    });

    it("deve rejeitar token com perfil inválido", () => {
        const service = new JwtService(SECRET);

        const token = jwt.sign(
            { role: "SUPERADMIN" },
            SECRET,
            { subject: user.id },
        );

        expect(() => service.verify(token)).toThrow("Token inválido.");
    });
});
