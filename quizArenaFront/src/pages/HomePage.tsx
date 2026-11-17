import { useNavigate } from "react-router-dom";

export default function HomePage() {
    const navigate = useNavigate();

    const user = JSON.parse(localStorage.getItem("user") ?? "null");

    function handleLogout() {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
    }

    return (
        <main>
            <h1>Bem-vindo ao Quiz Arena!</h1>

            <p>
                Olá, {user?.name ?? "jogador"}!
            </p>

            <p>
                Seu perfil: {user?.role ?? "não identificado"}
            </p>

            <button onClick={handleLogout}>
                Sair
            </button>
        </main>
    );
}