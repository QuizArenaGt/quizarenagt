
import type {
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
} from "../types/auth";

import { apiRequest } from "../../../services/api";

export async function login(
    request: LoginRequest,
): Promise<LoginResponse> {
    return apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify(request),
    });
}

export async function register(
    request: RegisterRequest,
): Promise<RegisterResponse> {
    return apiRequest<RegisterResponse>("/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify(request),
    });
}

export async function recoverPassword(
    request: { email: string },
): Promise<{ message: string }> {
    void request;
    throw new Error(
        "A recuperação de senha ainda não está disponível no servidor.",
    );
}
