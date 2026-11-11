
import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
    useNavigate
} from "react-router-dom";

import HomePage from "./pages/HomePage";
import LoginForm from "./features/auth/components/LoginForm/LoginForm";
import RegisterForm from "./features/auth/components/RegisterForm/RegisterForm";
import DashboardForm from './features/Dashboard/components/DashboardForm';
import RecoverPasswordForm from './features/auth/components/RecoverPasswordForm/RecoverPasswordForm';

function LoginPage() {
    const navigate = useNavigate();

    function handleLoginSuccess() {
        navigate("/");
    }

    return <LoginForm onSuccess={handleLoginSuccess} />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const token = localStorage.getItem("token");

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return children;
}

function AppRoutes() {
    const navigate = useNavigate();

    const handleLoginSuccess = (): void => {
        navigate('/dashboard');
    };

    const handleRegisterSuccess = (): void => {
        navigate('/login');
    };

    const handleRecoverPasswordSuccess = (): void => {
        navigate('/login');
    };
        
    return (
        <Routes>
            <Route
                path="/dashboard"
                element={<DashboardForm />}
            />

            <Route
                path="/recover-password"
                element={
                    <RecoverPasswordForm
                        onSuccess={handleRecoverPasswordSuccess}
                    />
                }
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
                path="/"
                element={
                    <LoginForm
                        onSuccess={handleLoginSuccess}
                    />
                }
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
