
import { Router } from "express";

import { RoundController } from "./round.controller.js";
import { authenticateToken } from "../auth/auth.middleware.js";

const roundRoutes = Router();
const roundController = new RoundController();

roundRoutes.post(
    "/rooms/:id/rounds",
    authenticateToken,
    (req, res) => {
        void roundController.createNext(req, res);
    },
);

roundRoutes.post(
    "/rounds/:id/close",
    authenticateToken,
    (req, res) => {
        void roundController.close(req, res);
    },
);

export { roundRoutes };
