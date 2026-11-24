
import { useEffect, useState, type ReactNode } from "react";

import {
    BrowserRouter,
    Routes,
    Route,
    useNavigate,
    Navigate,
} from "react-router-dom";

import HomeView from "./views/Home/HomeView";
import PlayView from "./views/Play/PlayView";
import ProjectionView from "./views/Projection/ProjectionView";
import LoginForm from "./features/auth/components/LoginForm/LoginForm";
import RegisterForm from "./features/auth/components/RegisterForm/RegisterForm";
import DashboardForm from "./features/Dashboard/components/DashboardForm";
import RecoverPasswordForm from "./features/auth/components/RecoverPasswordForm/RecoverPasswordForm";
import ResetPasswordForm from "./features/auth/components/ResetPasswordForm/ResetPasswordForm";

import { apiRequest, ApiError } from "./services/api";
import SessionStatusCard from "./components/layout/SessionStatusCard/SessionStatusCard";

interface AuthenticatedUser {
    id: string;
    role: "USER" | "ADMIN" | "HOST";
}

interface ProtectedRouteProps {
    render?: (authenticatedUserId: string | null) => ReactNode;
}

function ProtectedRoute({ render }: ProtectedRouteProps = {}) {
    const [status, setStatus] = useState<
        "checking" | "authenticated" | "unauthorized" | "error"
    >("checking");
    const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function validateSession() {
            const token = localStorage.getItem("token");

            if (!token) {
                if (active) {
                    setAuthenticatedUserId(null);
                    setStatus("unauthorized");
                }
                return;
            }

            try {
                const user = await apiRequest<AuthenticatedUser>("/auth/me", {
                    method: "GET",
                    token,
                });

                if (active) {
                    setAuthenticatedUserId(user.id);
                    setStatus("authenticated");
                }
            } catch (error) {
                if (!active) return;

                if (error instanceof ApiError && error.status === 401) {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                    setAuthenticatedUserId(null);
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
        return <SessionStatusCard status="checking" />;
    }

    if (status === "unauthorized") {
        return <Navigate to="/login" replace />;
    }

    if (status === "error") {
        return (
            <SessionStatusCard
                status="error"
                onRetry={() => window.location.reload()}
            />
        );
    }

    if (render) {
        return <>{render(authenticatedUserId)}</>;
    }

    return (
        <DashboardForm
            key={authenticatedUserId ?? "session"}
            authenticatedUserId={authenticatedUserId}
        />
    );
}

function AppRoutes() {
    const navigate = useNavigate();

    const handleLoginSuccess = (): void => {
        navigate("/dashboard");
    };

    const handleRegisterSuccess = (): void => {
        navigate("/login");
    };

    return (
        <Routes>
            <Route
                path="/dashboard"
                element={<ProtectedRoute />}
            />

            <Route
                path="/projetar/:code"
                element={<ProtectedRoute render={() => <ProjectionView />} />}
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
                element={<HomeView />}
            />

            <Route
                path="*"
                element={<Navigate to="/" replace />}
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
