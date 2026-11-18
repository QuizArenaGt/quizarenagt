
import nodemailer from "nodemailer";
import { emailConfig } from "../email/emailConfig.js";

interface SendEmailParams {
    to: string;
    subject: string;
    html: string;
}

interface PasswordResetEmailParams {
    to: string;
    name: string;
    resetToken: string;
    expiresInMinutes: number;
}

export class EmailService {
    private readonly transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port,
        secure: emailConfig.secure,
        auth: {
            user: emailConfig.auth.user,
            pass: emailConfig.auth.pass,
        },
    });

    async sendEmail({
        to,
        subject,
        html,
    }: SendEmailParams): Promise<void> {
        await this.transporter.sendMail({
            from: process.env.SMTP_FROM,
            to,
            subject,
            html,
        });
    }

    async sendPasswordResetEmail({
        to,
        name,
        resetToken,
        expiresInMinutes,
    }: PasswordResetEmailParams): Promise<void> {

        const frontendUrl =
            process.env.FRONTEND_URL ?? "http://localhost:5173";

        const resetUrl =
            `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                <h2>Recuperação de senha - Quiz Arena</h2>

                <p>Olá, ${name}!</p>

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

        await this.sendEmail({
            to,
            subject: "Recuperação de senha - Quiz Arena",
            html,
        });
    }
}
