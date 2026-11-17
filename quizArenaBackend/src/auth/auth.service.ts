
import { compare } from "bcryptjs";
import type { User } from "@prisma/client";

import { UserRepository } from "../users/user.repository.js";
import { InvalidCredentialsError } from "../users/user.errors.js";
import type { LoginDto } from "./login.dto.js";

type UserRepositoryContract = Pick<
    UserRepository,
    "findByEmail"
>;

export class AuthService {
    constructor(
        private readonly userRepository: UserRepositoryContract = new UserRepository(),
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
}
