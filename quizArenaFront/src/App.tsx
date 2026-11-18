import { useEffect, useState } from "react";
import {
    BrowserRouter,
    Routes,
    Route,
    useNavigate,
    Navigate,
} from "react-router-dom";
import HomeView from "./views/Home/HomeView";
import PlayView from "./views/Play/PlayView";
import HomePage from "./pages/HomePage";
import LoginForm from "./features/auth/components/LoginForm/LoginForm";

import RegisterForm from "./features/auth/components/RegisterForm/RegisterForm";
import DashboardForm from "./features/Dashboard/components/DashboardForm";
import RecoverPasswordForm from "./features/auth/components/RecoverPasswordForm/RecoverPasswordForm";
import ResetPasswordForm from "./features/auth/components/ResetPasswordForm/ResetPasswordForm";
import { apiRequest, ApiError } from "./services/api";

interface AuthenticatedUser {
    id: string;
    role: "USER" | "ADMIN" | "HOST";
}

function ProtectedRoute({
    children
}: {
    children: React.ReactNode
}) {
    const [status, setStatus] = useState<
        "checking" | "authenticated" | "unauthorized" | "error"
    >("checking");
    const token = localStorage.getItem("token");

    useEffect(() => {
        let active = true;

        async function validateSession() {
            const token = localStorage.getItem("token");

            if (!token) {
                if (active) setStatus("unauthorized");
                return;
            }

            try {
                await apiRequest<AuthenticatedUser>("/auth/me", {
                    method: "GET",
                    token,
                });

                if (active) {
                    setStatus("authenticated");
                }
            } catch (error) {
                if (!active) return;

                if (error instanceof ApiError && error.status === 401) {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    setStatus("unauthorized");
                    return;
                }

                setStatus("error");
            }
        }

        validateSession();

        return () => {
            active = false;
        };
    }, []);

    if (status === "checking") {
        return <div>Validando sessão...</div>;
    }

    if (status === "unauthorized") {
        return <Navigate to="/login" replace />;
    }

    if (status === "error") {
        return (
            <div>
                <h2>Não foi possível validar sua sessão.</h2>
                <p>Verifique se o servidor está disponível.</p>
                <button onClick={() => window.location.reload()}>
                    Tentar novamente
                </button>
            </div>
        );
    }

    return <DashboardForm />;
}


function AppRoutes() {

    const navigate = useNavigate();

    const handleLoginSuccess = (): void => {
        navigate("/dashboard");
    };

    const handleRegisterSuccess = (): void => {
        navigate("/login");
    };

    const handleRecoverPasswordSuccess = (): void => {
        navigate("/login");
    };

    return (
        <Routes>

            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute>
                        <DashboardForm />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/recover-password"
                element={<RecoverPasswordForm />}
            />

            <Route
                path="/reset-password"
                element={<ResetPasswordForm />}
            />

            <Route
                path="/register"
                element={
                    <RegisterForm
                        onSuccess={handleRegisterSuccess}
                    />
                }
            />

            <Route
                path="/login"
                element={
                    <LoginForm
                        onSuccess={handleLoginSuccess}
                    />
                }
            />

            <Route
                path="/jogar"
                element={<PlayView />}
            />

            <Route
                path="/"
                element={<Navigate to="/login" replace />}
            />

        </Routes>
    );
}


export default function App() {

    return (
        <BrowserRouter>
            <AppRoutes />
        </BrowserRouter>
    );
}