import { Router } from "express";
import { Role } from "@prisma/client";
import { QuestionController } from "./question.controller.js";
import { authenticateToken } from "../auth/auth.middleware.js";
import { authorizeRoles } from "../auth/authorize.middleware.js";

const questionRoutes = Router();
const questionController = new QuestionController();

questionRoutes.post(
    "/",
    authenticateToken,
    authorizeRoles(Role.ADMIN),
    (req, res) => {
        void questionController.create(req, res);
    },
);

export { questionRoutes };
