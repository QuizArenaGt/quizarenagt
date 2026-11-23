
import express from "express";
import cors from "cors";

import { authRoutes } from "./auth/auth.routes.js";
import { questionRoutes } from "./questions/question.routes.js";
import { roomRoutes } from "./rooms/room.routes.js";
import { roundRoutes } from "./rounds/round.routes.js";
import { roundAnswerRoutes } from "./round-answers/round-answer.routes.js";

const app = express();
const defaultJsonParser = express.json();
const IMPORT_QUESTIONS_ROUTE_PATTERN =
    /^\/rooms\/[^/]+\/questions\/import\/?$/;

app.use(cors());
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

export { app };
