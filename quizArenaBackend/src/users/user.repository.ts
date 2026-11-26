import type { User } from "@prisma/client";
import { prisma } from "../database/prisma.js";
import { normalizeEmail } from "../auth/auth-validation.js";

type CreateUserData = {
    name: string,
    email: string;
    password: string
}

export class UserRepository{
    async findById(id: string): Promise<User | null> {
        return prisma.user.findUnique({
            where: { id },
        });
    }

    async findByEmail(email: string): Promise<User | null> {
        const normalizedEmail = normalizeEmail(email);

        const exactMatch = await prisma.user.findUnique({
            where: { email: normalizedEmail },
        });

        if (exactMatch) {
            return exactMatch;
        }

        return prisma.user.findFirst({
            where: {
                email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                },
            },
        });
    }

    async create(data: CreateUserData): Promise<User> {
        return prisma.user.create({
            data: {
                ...data,
                email: normalizeEmail(data.email),
            },
        });
    }

    async updatePasswordAndBumpTokenVersion(
        id: string,
        passwordHash: string,
    ): Promise<User> {
        return prisma.user.update({
            where: { id },
            data: {
                password: passwordHash,
                tokenVersion: {
                    increment: 1,
                },
            },
        });
    }
}