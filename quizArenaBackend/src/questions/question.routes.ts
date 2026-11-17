
import { Router } from "express";
import { QuestionController } from "./question.controller.js";
import { authenticateToken } from "../auth/auth.middleware.js";

const questionRoutes = Router();
const questionController = new QuestionController();

questionRoutes.post(
    "/",
    authenticateToken,
    (req, res) => {
        void questionController.create(req, res);
    },
);

export { questionRoutes };
