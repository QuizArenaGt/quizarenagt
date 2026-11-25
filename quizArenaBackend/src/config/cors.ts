import type { CorsOptions } from "cors";

const DEV_LOCALHOST_ORIGINS: RegExp[] = [
    /^https?:\/\/localhost(?::\d{1,5})?$/,
    /^https?:\/\/127\.0\.0\.1(?::\d{1,5})?$/,
];

export type AllowedCorsOrigin = string[] | RegExp[];

function validateAndNormalizeOrigin(rawToken: string): string {
    const trimmed = rawToken.trim();

    if (trimmed.includes("*")) {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}"): wildcard "*" não é permitido.`,
        );
    }

    if (trimmed.includes("?") || trimmed.includes("#")) {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}"): caminhos, query strings e fragmentos não são permitidos.`,
        );
    }

    const withoutTrailingSlashes = trimmed.replace(/\/+$/, "");

    if (withoutTrailingSlashes.length === 0) {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}").`,
        );
    }

    let parsed: URL;
    try {
        parsed = new URL(withoutTrailingSlashes);
    } catch {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}").`,
        );
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}"): protocolo deve ser http ou https.`,
        );
    }

    if (parsed.username || parsed.password) {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}"): credenciais na URL não são permitidas.`,
        );
    }

    if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}"): informe apenas esquema, host e porta opcional (sem caminho, query ou fragmento).`,
        );
    }

    if (!parsed.hostname || parsed.hostname.includes("*")) {
        throw new Error(
            `Origem CORS inválida em FRONTEND_URL ("${trimmed}").`,
        );
    }

    return parsed.origin;
}

/**
 * Valida e normaliza as origens permitidas em `FRONTEND_URL` (separadas por vírgula).
 * - Em produção (`NODE_ENV=production`), exige `FRONTEND_URL` válida e nunca usa `"*"`.
 * - Fora de produção, permite origens locais (`localhost` / `127.0.0.1`) quando `FRONTEND_URL` não está definida.
 */
export function parseAllowedOrigins(
    rawOrigin?: string | undefined,
    nodeEnv: string | undefined = process.env.NODE_ENV,
): AllowedCorsOrigin {
    const isProduction = (nodeEnv ?? "").trim().toLowerCase() === "production";
    const rawValue = rawOrigin ?? "";
    const trimmedRaw = rawValue.trim();

    if (trimmedRaw.length === 0) {
        if (isProduction) {
            throw new Error(
                "Configuração inválida de CORS: FRONTEND_URL é obrigatória em produção (NODE_ENV=production).",
            );
        }

        return [...DEV_LOCALHOST_ORIGINS];
    }

    const entries = rawValue
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);

    if (entries.length === 0) {
        throw new Error(
            "Configuração inválida de CORS: FRONTEND_URL não contém nenhuma origem válida.",
        );
    }

    const normalized = entries.map(validateAndNormalizeOrigin);
    return Array.from(new Set(normalized));
}

export function createHttpCorsOptions(
    env: NodeJS.ProcessEnv = process.env,
): CorsOptions {
    return {
        origin: parseAllowedOrigins(env.FRONTEND_URL, env.NODE_ENV),
        exposedHeaders: ["X-Server-Time"],
    };
}

export function createSocketCorsOptions(
    env: NodeJS.ProcessEnv = process.env,
): CorsOptions {
    return {
        origin: parseAllowedOrigins(env.FRONTEND_URL, env.NODE_ENV),
        methods: ["GET", "POST"],
    };
}
