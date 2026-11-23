import nodemailer, { type Transporter } from "nodemailer";
import { resolveEmailConfig, type EmailConfig } from "./emailConfig.js";

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

interface PasswordResetEmailParams {
    to: string;
    name: string;
    resetToken: string;
    expiresInMinutes: number;
}

export interface EmailServiceDeps {
    getConfig?: () => EmailConfig;
    createTransporter?: (config: EmailConfig) => Pick<Transporter, "sendMail">;
}

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function resolvePrimaryFrontendUrl(
    rawValue = process.env.FRONTEND_URL,
): string {
    const firstOrigin = rawValue
        ?.split(",")
        .map((item) => item.trim())
        .find((item) => item.length > 0);

    const baseUrl = firstOrigin || "http://localhost:5173";
    return baseUrl.replace(/\/+$/, "");
}

function defaultCreateTransporter(config: EmailConfig): Pick<Transporter, "sendMail"> {
    return nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.auth.user,
            pass: config.auth.pass,
        },
    });
}

export class EmailService {
    private readonly getConfig: () => EmailConfig;
    private readonly createTransporter: (
        config: EmailConfig,
    ) => Pick<Transporter, "sendMail">;
    private cachedTransporter: Pick<Transporter, "sendMail"> | null = null;
    private cachedConfigKey: string | null = null;

    constructor(deps: EmailServiceDeps = {}) {
        this.getConfig = deps.getConfig ?? resolveEmailConfig;
        this.createTransporter =
            deps.createTransporter ?? defaultCreateTransporter;
    }

    private resolveRuntimeClient(): {
        config: EmailConfig;
        transporter: Pick<Transporter, "sendMail">;
    } {
        const config = this.getConfig();
        const configKey = JSON.stringify([
            config.host,
            config.port,
            config.secure,
            config.auth.user,
            config.from,
        ]);

        if (!this.cachedTransporter || this.cachedConfigKey !== configKey) {
            this.cachedTransporter = this.createTransporter(config);
            this.cachedConfigKey = configKey;
        }

        return { config, transporter: this.cachedTransporter };
    }

    async sendEmail({ to, subject, html, text }: SendEmailParams): Promise<void> {
        const { config, transporter } = this.resolveRuntimeClient();

        await transporter.sendMail({
            from: config.from,
            to,
            subject,
            html,
            ...(text ? { text } : {}),
        });
    }

    async sendPasswordResetEmail({
        to,
        name,
        resetToken,
        expiresInMinutes,
    }: PasswordResetEmailParams): Promise<void> {
        const frontendUrl = resolvePrimaryFrontendUrl();
        const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
        const safeName = escapeHtml(name.trim() || "usuário");

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2>Recuperação de senha - Quiz Arena</h2>

                <p>Olá, ${safeName}!</p>

                <p>
                    Recebemos uma solicitação para redefinir
                    a senha da sua conta.
                </p>

                <p>
                    Para continuar, clique no botão abaixo:
                </p>

                <p style="margin: 30px 0;">
                    <a
                        href="${resetUrl}"
                        style="
                            background-color: #2563eb;
                            color: white;
                            padding: 12px 24px;
                            text-decoration: none;
                            border-radius: 6px;
                        "
                    >
                        Redefinir senha
                    </a>
                </p>

                <p>
                    Este link expira em ${expiresInMinutes} minutos.
                </p>

                <p>
                    Se você não solicitou a recuperação,
                    ignore este e-mail.
                </p>

                <hr />

                <small>Quiz Arena</small>
            </div>
        `;

        const text = [
            "Recuperação de senha - Quiz Arena",
            "",
            `Olá, ${name.trim() || "usuário"}!`,
            "",
            "Recebemos uma solicitação para redefinir a senha da sua conta.",
            `Acesse o link abaixo para continuar (expira em ${expiresInMinutes} minutos):`,
            resetUrl,
            "",
            "Se você não solicitou a recuperação, ignore este e-mail.",
        ].join("\n");

        await this.sendEmail({
            to,
            subject: "Recuperação de senha - Quiz Arena",
            html,
            text,
        });
    }
}
