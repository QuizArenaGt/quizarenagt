
import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { authenticateToken } from "./auth.middleware.js";
import {
    changePasswordLimiter,
    recoverPasswordEmailLimiter,
    recoverPasswordIpLimiter,
    resetPasswordLimiter,
} from "./rate-limit.middleware.js";

const authRoutes = Router();
const authController = new AuthController();

authRoutes.post("/register", (req, res) => {
    void authController.register(req, res);
});

authRoutes.post("/login", (req, res) => {
    void authController.login(req, res);
});

authRoutes.post(
    "/recover-password",
    recoverPasswordIpLimiter.middleware,
    recoverPasswordEmailLimiter.middleware,
    (req, res) => {
        void authController.recoverPassword(req, res);
    },
);

authRoutes.post(
    "/reset-password",
    resetPasswordLimiter.middleware,
    (req, res) => {
        void authController.resetPassword(req, res);
    },
);

authRoutes.post(
    "/change-password",
    authenticateToken,
    changePasswordLimiter.middleware,
    (req, res) => {
        void authController.changePassword(req, res);
    },
);

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
