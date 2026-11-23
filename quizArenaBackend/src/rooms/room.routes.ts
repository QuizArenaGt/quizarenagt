
import { Router } from "express";

import { RoomController } from "./room.controller.js";
import { authenticateToken } from "../auth/auth.middleware.js";
import { authenticateRoomPlayer } from "./room-player-auth.middleware.js";

const roomRoutes = Router();
const roomController = new RoomController();

roomRoutes.post(
    "/join",
    (req, res) => {
        void roomController.join(req, res);
    },
);

roomRoutes.post(
    "/leave",
    authenticateRoomPlayer,
    (req, res) => {
        void roomController.leave(req, res);
    },
);

roomRoutes.get(
    "/",
    authenticateToken,
    (req, res) => {
        void roomController.listByHost(req, res);
    },
);

roomRoutes.post(
    "/",
    authenticateToken,
    (req, res) => {
        void roomController.create(req, res);
    },
);

roomRoutes.get(
    "/:id/games/:gameId/results",
    authenticateToken,
    (req, res) => {
        void roomController.getGameResults(req, res);
    },
);

roomRoutes.get(
    "/:id/games",
    authenticateToken,
    (req, res) => {
        void roomController.listGames(req, res);
    },
);

roomRoutes.get(
    "/:code/availability",
    (req, res) => {
        void roomController.checkAvailability(req, res);
    },
);

roomRoutes.get(
    "/:code",
    (req, res) => {
        void roomController.getLobby(req, res);
    },
);

roomRoutes.patch(
    "/:id",
    authenticateToken,
    (req, res) => {
        void roomController.update(req, res);
    },
);

roomRoutes.post("/:id/start", authenticateToken, (req, res) => {
    void roomController.start(req, res);
});

roomRoutes.post("/:id/play-again", authenticateToken, (req, res) => {
    void roomController.playAgain(req, res);
});

roomRoutes.post("/:id/finish", authenticateToken, (req, res) => {
    void roomController.finish(req, res);
});

roomRoutes.delete("/:id", authenticateToken, (req, res) => {
    void roomController.archive(req, res);
});

export { roomRoutes };
