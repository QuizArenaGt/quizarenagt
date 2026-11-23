
import type { PasswordResetToken } from "@prisma/client";
import { prisma } from "../database/prisma.js";

type CreatePasswordResetTokenData = {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
};

export class PasswordResetTokenRepository {

    async findByTokenHash(
        tokenHash: string
    ): Promise<PasswordResetToken | null> {
        return prisma.passwordResetToken.findUnique({
            where: { tokenHash },
        });
    }

    async deleteByTokenHash(tokenHash: string): Promise<void> {
        await prisma.passwordResetToken.deleteMany({
            where: { tokenHash },
        });
    }

    async replaceForUser(
        data: CreatePasswordResetTokenData
    ): Promise<PasswordResetToken> {
        return prisma.$transaction(async (tx) => {
            await tx.passwordResetToken.deleteMany({
                where: { userId: data.userId },
            });

            return tx.passwordResetToken.create({
                data,
            });
        });
    }

    async consume(
        tokenHash: string,
        passwordHash: string
    ): Promise<boolean> {

        return prisma.$transaction(async (tx) => {

            const now = new Date();

            const token = await tx.passwordResetToken.findUnique({
                where: { tokenHash },
            });

            if (!token || token.expiresAt <= now) {
                return false;
            }

            const deleted = await tx.passwordResetToken.deleteMany({
                where: {
                    id: token.id,
                    expiresAt: { gt: now },
                },
            });

            if (deleted.count !== 1) {
                return false;
            }

            await tx.user.update({
                where: { id: token.userId },
                data: {
                    password: passwordHash,
                    tokenVersion: {
                        increment: 1,
                    },
                },
            });

            await tx.passwordResetToken.deleteMany({
                where: { userId: token.userId },
            });

            return true;
        });
    }
}
