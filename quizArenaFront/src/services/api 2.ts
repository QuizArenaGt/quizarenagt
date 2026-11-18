
const API_URL = (
    import.meta.env.VITE_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

interface ApiRequestOptions extends RequestInit {
    token?: string | null;
    auth?: boolean;
}


export class ApiError extends Error {
    public readonly status: number;
    public readonly errors?: Record<string, string>;

    constructor(
        message: string,
        status: number,
        errors?: Record<string, string>,
    ) {
        super(message);

        this.name = "ApiError";
        this.status = status;
        this.errors = errors;
    }
}


export async function apiRequest<T>(
    path: string,
    options: ApiRequestOptions = {},
): Promise<T> {
    const {
        token,
        auth = true,
        headers,
        ...requestOptions
    } = options;

    const requestHeaders = new Headers(headers);

    if (
        requestOptions.body &&
        !(requestOptions.body instanceof FormData) &&
        !requestHeaders.has("Content-Type")
    ) {
        requestHeaders.set("Content-Type", "application/json");
    }

    const accessToken = token ??
        (auth ? localStorage.getItem("token") : null);

    if (accessToken) {
        requestHeaders.set("Authorization", `Bearer ${accessToken}`);
    }

    let response: Response;

    try {
        response = await fetch(`${API_URL}${path}`, {
            ...requestOptions,
            headers: requestHeaders,
        });
    } catch {
        throw new Error(
            "Não foi possível conectar ao servidor. Verifique sua conexão.",
        );
    }

    const responseText = await response.text();

    let data: unknown = null;

    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch {
            data = null;
        }
    }

    if (!response.ok) {
        const payload =
            typeof data === "object" && data !== null
                ? data as {
                    message?: string;
                    errors?: Record<string, string>;
                }
                : {};

        throw new ApiError(
            payload.message ?? `Erro na requisição (${response.status}).`,
            response.status,
            payload.errors,
        );
    }

    return data as T;
}

export { API_URL };
