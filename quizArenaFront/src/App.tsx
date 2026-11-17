
import {
    BrowserRouter,
    Routes,
    Route,
    useNavigate
} from "react-router-dom";

import HomeView from "./views/Home/HomeView";
import PlayView from "./views/Play/PlayView";
import LoginForm from "./features/auth/components/LoginForm/LoginForm";
import RegisterForm from "./features/auth/components/RegisterForm/RegisterForm";
import DashboardForm from './features/Dashboard/components/DashboardForm';
import RecoverPasswordForm from './features/auth/components/RecoverPasswordForm/RecoverPasswordForm';

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

            {/* Área do aluno: entrar em uma sala pelo código e jogar.
                Sem login; por enquanto apenas a sala de demonstração. */}
            <Route
                path="/jogar"
                element={<PlayView />}
            />

            {/* Landing page pública. O login continua disponível em /login
                e também é aberto em um modal a partir desta página. */}
            <Route
                path="/"
                element={<HomeView />}
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
