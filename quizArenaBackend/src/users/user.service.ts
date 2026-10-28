import { hash } from "bcryptjs"
import type { User } from "@prisma/client";
import { UserRepository } from "./user.repository.js";
import { EmailAlreadyExistsError } from "./user.errors.js";
import type { RegisterUserDto } from "../auth/register.dto.js";

export class UserService {
    constructor(
        private readonly userRepository = new UserRepository(),
    ){}

    async register(data: RegisterUserDto): Promise<User> {
        const existingUser = await this.userRepository.findByEmail(data.email);

        if (existingUser){
            throw new EmailAlreadyExistsError();
        }

        const passwordHash = await hash(data.password, 12);

        try {
            return await this.userRepository.create({
                name: data.name,
                email: data.email,
                password: passwordHash,
            });
        } catch (error: unknown) {
            if (this.isEmailUniqueConstraintError(error)) {
                throw new EmailAlreadyExistsError();
            }

            throw error;
        }
    }

    private isEmailUniqueConstraintError (error: unknown): boolean{
        if(
            typeof error !== "object" ||
            error === null ||
            !("code" in error) ||
            error.code !== "P2002" ||
            !("meta" in error)
        ) {
            return false;
        }

        const meta = error.meta;

        if (typeof meta !== "object" || meta === null || !("target" in meta)) {
            return false;
        }

        const target = meta.target;

        if (Array.isArray(target)){
            return target.includes("email");
        }

        return (
            typeof target === "string" &&
            target.toLowerCase().includes("email")
        );
    }
}
