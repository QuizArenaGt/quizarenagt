export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    userId: number;
    name: string;
}

export interface RecoverPasswordRequest {
    email: string;
}

export interface RecoverPasswordResponse {
    message: string;
}

export interface RegisterRequest {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export interface RegisterResponse {
    userId: number;
    name: string;
}