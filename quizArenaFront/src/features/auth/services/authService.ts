
import type {
    LoginRequest,
    LoginResponse,
    RecoverPasswordRequest,
    RecoverPasswordResponse,
    RegisterRequest,
    RegisterResponse,
} from "../types/auth";

import { apiRequest } from "../../../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function login(
    request: LoginRequest
): Promise<LoginResponse> {

    const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });

    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.message ?? "Erro ao fazer login.");
    }

    return data as LoginResponse;
}

export async function register(
    request: RegisterRequest,
): Promise<RegisterResponse> {
    const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message ?? "Erro ao cadastrar usuário.");
    }

    return data as RegisterResponse;
}

export async function recoverPassword(
    request: RecoverPasswordRequest
): Promise<RecoverPasswordResponse> {

    const response = await fetch(
        `${API_URL}/auth/recover-password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.message ?? "Erro ao solicitar recuperação de senha."
        );
    }

    return data as RecoverPasswordResponse;
}

export interface ResetPasswordRequest {
    token: string;
    newPassword: string;
}

export interface ResetPasswordResponse {
    message: string;
}

export async function resetPassword(
    request: ResetPasswordRequest
): Promise<ResetPasswordResponse> {
    const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/auth/reset-password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(request),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Não foi possível redefinir sua senha.");
    }

    return data;
}
