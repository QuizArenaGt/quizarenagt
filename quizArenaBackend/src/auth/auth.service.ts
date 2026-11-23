
import { compare, hash } from "bcryptjs";
import type { User } from "@prisma/client";

import { UserRepository } from "../users/user.repository.js";
import {
    disconnectUserSockets,
    disconnectUserSocketsSafely,
} from "../realtime/room-events.js";
import {
    InvalidCredentialsError,
    InvalidCurrentPasswordError,
    SamePasswordError,
} from "../users/user.errors.js";
import type { ChangePasswordDto } from "./change-password.dto.js";
import type { LoginDto } from "./login.dto.js";

type UserRepositoryContract = Pick<UserRepository, "findByEmail"> &
    Partial<
        Pick<UserRepository, "findById" | "updatePasswordAndBumpTokenVersion">
    >;

export class AuthService {
    constructor(
        private readonly userRepository: UserRepositoryContract = new UserRepository(),
        private readonly disconnectSocketsForUser: (
            userId: string,
        ) => Promise<void> = disconnectUserSockets,
    ) {}

    async authenticate(data: LoginDto): Promise<User> {
        const user = await this.userRepository.findByEmail(data.email);

        if (!user) {
            throw new InvalidCredentialsError();
        }

        const passwordMatches = await compare(
            data.password,
            user.password,
        );

        if (!passwordMatches) {
            throw new InvalidCredentialsError();
        }

        return user;
    }

    async changePassword(
        userId: string,
        data: ChangePasswordDto,
    ): Promise<User> {
        if (
            !this.userRepository.findById ||
            !this.userRepository.updatePasswordAndBumpTokenVersion
        ) {
            throw new Error(
                "Repositório de usuário não suporta alteração de senha.",
            );
        }

        const user = await this.userRepository.findById(userId);

        if (!user) {
            throw new InvalidCredentialsError();
        }

        const passwordMatches = await compare(
            data.currentPassword,
            user.password,
        );

        if (!passwordMatches) {
            throw new InvalidCurrentPasswordError();
        }

        if (data.newPassword === data.currentPassword) {
            throw new SamePasswordError();
        }

        const passwordHash = await hash(data.newPassword, 12);

        const updatedUser =
            await this.userRepository.updatePasswordAndBumpTokenVersion(
                user.id,
                passwordHash,
            );

        await disconnectUserSocketsSafely(
            updatedUser.id,
            this.disconnectSocketsForUser,
        );

        return updatedUser;
    }
}
