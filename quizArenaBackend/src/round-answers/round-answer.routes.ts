
import { Router } from "express";

import { authenticateRoomPlayer } from "../rooms/room-player-auth.middleware.js";
import { RoundAnswerController } from "./round-answer.controller.js";

const roundAnswerRoutes = Router();
const roundAnswerController = new RoundAnswerController();

roundAnswerRoutes.post(
    "/:id/answer",
    authenticateRoomPlayer,
    (req, res) => {
        void roundAnswerController.submit(req, res);
    },
);

export { roundAnswerRoutes };
