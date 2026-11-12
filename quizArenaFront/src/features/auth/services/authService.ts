import type {
    LoginRequest,
    LoginResponse,
    RecoverPasswordResponse,
    RegisterRequest,
    RegisterResponse
} from "../types/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function login(request: LoginRequest): Promise<LoginResponse> {
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
    request: RegisterRequest
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

export async function recoverPassword(request: { email: string }): Promise<{ message: string }> {
    console.log("Enviando requisição de recuperação de senha:", request);
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await fetch("http://localhost:3000/api/auth/recover-password", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error("Erro ao enviar instruções de recuperação de senha");
    }
    return data as RecoverPasswordResponse;
}