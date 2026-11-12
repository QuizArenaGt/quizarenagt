import express from "express";
import cors from "cors";
import { authRoutes } from "./auth/auth.routes.js";
import { questionRoutes } from "./questions/question.routes.js";

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

export { app };