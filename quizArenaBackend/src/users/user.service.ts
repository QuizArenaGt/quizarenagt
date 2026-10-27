import { hash } from "bcryptjs"
import type { User } from "@prisma/client";
import { UserRepository } from "./user.repository.js";

type RegisterUserData = {
    name: string;
    email: string;
    password: string;
};

export class UserService {
    constructor(
        private readonly userRepository = new UserRepository(),
    ){}

    async register(data: RegisterUserData): Promise<User> {
        const existingUser = await this.userRepository.findByEmail(data.email);

        if (existingUser){
            throw new Error ("E-mail já cadastrado.");
        }

        const passwordHash = await hash(data.password, 12);

        return this.userRepository.create({
            name: data.name,
            email: data.email,
            password: passwordHash,
        });
    }
}
