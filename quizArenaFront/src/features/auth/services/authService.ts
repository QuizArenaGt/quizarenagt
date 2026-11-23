
import type {
    LoginRequest,
    LoginResponse,
    RecoverPasswordRequest,
    RecoverPasswordResponse,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
} from "../types/auth";

import { apiRequest } from "../../../services/api.ts";

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
    request: RecoverPasswordRequest,
): Promise<RecoverPasswordResponse> {
    return apiRequest<RecoverPasswordResponse>("/auth/recover-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify(request),
    });
}

export async function resetPassword(
    request: ResetPasswordRequest,
): Promise<ResetPasswordResponse> {
    return apiRequest<ResetPasswordResponse>("/auth/reset-password", {
        method: "POST",
        auth: false,
        body: JSON.stringify(request),
    });
}
