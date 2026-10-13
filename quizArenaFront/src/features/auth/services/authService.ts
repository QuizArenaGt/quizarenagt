import type { LoginRequest, LoginResponse } from "../types/auth";

export async function register(request: { name: string; email: string; password: string; confirmPassword: string }): Promise<{ message: string }> {
    console.log("Enviando requisição de registro:", request);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
        message: "Usuário registrado com sucesso."
    }
    /*
    const response = await fetch("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error("Erro ao registrar usuário");
    }
        return response.json();
    */
}

export async function recoverPassword(request: { email: string }): Promise<{ message: string }> {
    console.log("Enviando requisição de recuperação de senha:", request);
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        message: "Instruções de recuperação de senha enviadas para o e-mail."
    }
    /* 
    const response = await fetch("http://localhost:3000/api/auth/recover-password", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error("Erro ao enviar instruções de recuperação de senha");
    }
        return response.json();
    */
}

export async function login(request: LoginRequest): Promise<LoginResponse> {
    console.log("Enviando requisição de login:", request);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
        token: "fake-jwt-token",
        userId: 1,
        name: "Igor"
    }
    /* 
    const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(response),
    });

    if (!response.ok) {
        throw new Error("Erro ao fazer login");
    }
        return response.json();
    */
}