
import { createHash, randomBytes } from "crypto";
import { hash } from "bcryptjs";

import { UserService } from "../users/user.service.js";
import { EmailService } from "../email/emailService.js";
import {
    disconnectUserSockets,
    disconnectUserSocketsSafely,
} from "../realtime/room-events.js";
import { PasswordResetTokenRepository } from "./passwordResetToken.repository.js";

export class RecoverPasswordService {
    constructor(
        private readonly userService = new UserService(),
        private readonly emailService = new EmailService(),
        private readonly passwordResetTokenRepository =
            new PasswordResetTokenRepository(),
        private readonly disconnectSocketsForUser: (
            userId: string,
        ) => Promise<void> = disconnectUserSockets,
    ) {}

    async requestPasswordReset(email: string): Promise<void> {
        const user = await this.userService.findByEmail(email);

        // Não revela se o usuário existe.
        if (!user) {
            return;
        }

        // 1. Gerar token seguro.
        const token = randomBytes(32).toString("hex");

        // 2. Gerar hash para armazenamento.
        const tokenHash = createHash("sha256")
            .update(token)
            .digest("hex");

        // 3. Definir expiração.
        const expiresInMinutes = 15;

        const expiresAt = new Date(
            Date.now() + expiresInMinutes * 60 * 1000,
        );

        // 4. Persistir o novo token e invalidar os anteriores.
        await this.passwordResetTokenRepository.replaceForUser({
            userId: user.id,
            tokenHash,
            expiresAt,
        });

        // 5. Enviar e-mail com o token original.
        try {
            await this.emailService.sendPasswordResetEmail({
                to: user.email,
                name: user.name,
                resetToken: token,
                expiresInMinutes,
            });
        } catch (error: unknown) {
            // Remove somente o token desta solicitação.
            await this.passwordResetTokenRepository.deleteByTokenHash(
                tokenHash,
            );

            throw error;
        }
    }

    async resetPassword(
        token: string,
        newPassword: string,
    ): Promise<void> {
        // 1. Gerar hash do token recebido.
        const tokenHash = createHash("sha256")
            .update(token)
            .digest("hex");

        // 2. Consultar o token no banco.
        const tokenRecord =
            await this.passwordResetTokenRepository.findByTokenHash(
                tokenHash,
            );

        // 3. Validar existência e expiração.
        if (
            !tokenRecord ||
            tokenRecord.expiresAt <= new Date()
        ) {
            throw new Error("Token inválido ou expirado.");
        }

        // 4. Gerar hash da nova senha.
        const passwordHash = await hash(newPassword, 12);

        // 5. Atualizar a senha e consumir o token atomicamente.
        const consumed =
            await this.passwordResetTokenRepository.consume(
                tokenHash,
                passwordHash,
            );

        if (!consumed) {
            throw new Error("Token inválido ou expirado.");
        }

        await disconnectUserSocketsSafely(
            tokenRecord.userId,
            this.disconnectSocketsForUser,
        );
    }
}
