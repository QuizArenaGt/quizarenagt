import { Router } from "express";
import { AuthController } from "./auth.controller.js";

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post("/register", (req, res) => {
    void authController.register(req, res);
});

export { authRoutes };
