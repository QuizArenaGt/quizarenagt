export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: "USER" | "ADMIN" | "HOST";
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: AuthUser;
}

export interface RegisterRequest {
    name: string;
    email: string;
    password: string;
}

export interface RegisterResponse {
    id: string;
    name: string;
    email: string;
    role: "USER" | "ADMIN" | "HOST";
    createdAt: string;
}