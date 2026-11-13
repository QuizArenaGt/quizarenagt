import { Router } from "express";

import { RoomController } from "./room.controller.js";
import { authenticateToken } from "../auth/auth.middleware.js";

const roomRoutes = Router();
const roomController = new RoomController();

roomRoutes.post(
    "/",
    authenticateToken,
    (req, res) => {
        void roomController.create(req, res);
    },
);

roomRoutes.patch(
    "/:id",
    authenticateToken,
    (req, res) => {
        void roomController.update(req, res);
    },
);

export { roomRoutes };
