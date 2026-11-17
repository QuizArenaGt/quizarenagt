
import express from "express";
import cors from "cors";

import { authRoutes } from "./auth/auth.routes.js";
import { questionRoutes } from "./questions/question.routes.js";
import { roomRoutes } from "./rooms/room.routes.js";
import { roundRoutes } from "./rounds/round.routes.js";
import { roundAnswerRoutes } from "./round-answers/round-answer.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

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
