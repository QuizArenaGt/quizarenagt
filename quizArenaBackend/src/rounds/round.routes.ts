import { Router } from "express";

import { RoundController } from "./round.controller.js";
import { authenticateToken } from "../auth/auth.middleware.js";

const roundRoutes = Router();
const roundController = new RoundController();

roundRoutes.post(
    "/:id/rounds",
    authenticateToken,
    (req, res) => {
        void roundController.createNext(req, res);
    },
);

export { roundRoutes };
