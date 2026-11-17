
import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authenticateToken } from "./auth.middleware.js";

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post("/register", (req, res) => {
    void authController.register(req, res);
});

authRoutes.post("/login", (req, res) => {
    void authController.login(req, res);
});

authRoutes.get("/me", authenticateToken, (req, res) => {
    if (!req.user) {
        res.status(401).json({
            message: "Autenticação necessária.",
        });
        return;
    }

    res.status(200).json({
        id: req.user.id,
        role: req.user.role,
    });
});

export { authRoutes };
