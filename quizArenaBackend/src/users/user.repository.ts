import type { User } from "@prisma/client";
import { prisma } from "../database/prisma.js";

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
        return prisma.user.findUnique({
            where: { email },
        });
    }

    async create(data: CreateUserData): Promise<User> {
        return prisma.user.create({
            data,
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