
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";

import { authRoutes } from "./auth/auth.routes.js";
import { questionRoutes } from "./questions/question.routes.js";
import { roomRoutes } from "./rooms/room.routes.js";
import { roundRoutes } from "./rounds/round.routes.js";
import { roundAnswerRoutes } from "./round-answers/round-answer.routes.js";
import { getServerNowMs } from "./realtime/server-clock.js";

const app = express();
const defaultJsonParser = express.json();
const IMPORT_QUESTIONS_ROUTE_PATTERN =
    /^\/rooms\/[^/]+\/questions\/import\/?$/;

const allowedOrigins = process.env.FRONTEND_URL?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : "*",
        exposedHeaders: ["X-Server-Time"],
    }),
);
app.use((_req, res, next) => {
    res.setHeader("X-Server-Time", String(getServerNowMs()));
    next();
});
app.use((req, res, next) => {
    // A rota de importação possui parser dedicado (limite de 1 MB) após autenticação.
    if (
        req.method === "POST" &&
        IMPORT_QUESTIONS_ROUTE_PATTERN.test(req.path)
    ) {
        next();
        return;
    }

    defaultJsonParser(req, res, next);
});

app.get("/", (_req, res) => {
    res.status(200).json({
        status: "ok",
        message: "Backend rodando com sucesso!",
    });
});

app.use("/auth", authRoutes);
app.use("/questions", questionRoutes);
app.use("/rooms", roomRoutes);
app.use("/", roundRoutes);
app.use("/rounds", roundAnswerRoutes);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;

    if (err instanceof SyntaxError && "body" in err) {
        res.status(400).json({
            message: "Corpo da requisição JSON inválido.",
        });
        return;
    }

    if (typeof err === "object" && err !== null) {
        const statusCandidate =
            "statusCode" in err && typeof err.statusCode === "number"
                ? err.statusCode
                : "status" in err && typeof err.status === "number"
                  ? err.status
                  : null;

        if (
            statusCandidate !== null &&
            statusCandidate >= 400 &&
            statusCandidate < 500
        ) {
            res.status(statusCandidate).json({
                message:
                    statusCandidate === 413
                        ? "O corpo da requisição excede o limite permitido."
                        : "Requisição inválida.",
            });
            return;
        }
    }

    console.error("Erro inesperado na API:", err);
    res.status(500).json({
        message: "Erro interno do servidor.",
    });
});

export { app };
