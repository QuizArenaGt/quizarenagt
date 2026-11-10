
import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
    useNavigate
} from "react-router-dom";

import LoginForm from "./features/auth/components/LoginForm/LoginForm";
import RegisterForm from "./features/auth/components/RegisterForm/RegisterForm";
import HomePage from "./pages/HomePage";

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

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/login"
                    element={<LoginPage />}
                />

                <Route
                    path="/register"
                    element={<RegisterForm />}
                />

                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <HomePage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="*"
                    element={<Navigate to="/" replace />}
                />
            </Routes>
        </BrowserRouter>
    );
}
