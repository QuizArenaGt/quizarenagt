import type { LoginRequest, LoginResponse } from "../types/auth";

export async function login(request: LoginRequest): Promise<LoginResponse> {
    console.log("Enviando requisição de login:", request);
    /*    
        Aqui eu simulo a chamada HTTP com um atraso de 1 segundo
        TODO: Tirar isso daqui e remover o comentário pra chamar de fato.
    */
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
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error("Erro ao fazer login");
    }
        return response.json();
    */
}