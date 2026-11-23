export interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    from: string;
}

export class EmailNotConfiguredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EmailNotConfiguredError";
    }
}

function getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new EmailNotConfiguredError(
            `Variável de ambiente ${name} não configurada.`,
        );
    }

    return value;
}

function getPort(): number {
    const rawPort = process.env.SMTP_PORT?.trim() || "587";
    const port = Number(rawPort);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new EmailNotConfiguredError(
            "SMTP_PORT possui um valor inválido.",
        );
    }

    return port;
}

function getSecure(): boolean {
    const value = process.env.SMTP_SECURE?.trim().toLowerCase();

    if (value === undefined || value === "") {
        return false;
    }

    if (value !== "true" && value !== "false") {
        throw new EmailNotConfiguredError(
            'SMTP_SECURE deve possuir o valor "true" ou "false".',
        );
    }

    return value === "true";
}

export function resolveEmailConfig(): EmailConfig {
    return {
        host: getRequiredEnv("SMTP_HOST"),
        port: getPort(),
        secure: getSecure(),
        auth: {
            user: getRequiredEnv("SMTP_USER"),
            pass: getRequiredEnv("SMTP_PASSWORD"),
        },
        from: getRequiredEnv("SMTP_FROM"),
    };
}

export function isEmailConfigured(): boolean {
    try {
        resolveEmailConfig();
        return true;
    } catch {
        return false;
    }
}
