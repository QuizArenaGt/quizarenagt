
import { Router } from "express";

import { QuestionController } from "./question.controller.js";
import { authenticateToken } from "../auth/auth.middleware.js";

const questionRoutes = Router();
const questionController = new QuestionController();

questionRoutes.get("/", authenticateToken, (req, res) => {
    void questionController.list(req, res);
});

questionRoutes.post("/", authenticateToken, (req, res) => {
    void questionController.create(req, res);
});

questionRoutes.put("/:id", authenticateToken, (req, res) => {
    void questionController.update(req, res);
});

questionRoutes.delete("/:id", authenticateToken, (req, res) => {
    void questionController.delete(req, res);
});

export { questionRoutes };
