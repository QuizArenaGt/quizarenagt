import LoginForm from '../../../features/auth/components/LoginForm/LoginForm';
import Logo from '../../../components/ui/Logo/Logo';
import Modal from '../../../components/ui/Modal/Modal';
import './LoginModal.css';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

/*
 * Componente de APRESENTAÇÃO que envolve o LoginForm existente.
 *
 * Decisão importante: o formulário, as validações, a chamada ao
 * authService e a gravação do token continuam 100% dentro do LoginForm
 * original, que é reutilizado sem alterações de lógica. Aqui só
 * posicionamos o formulário dentro de um modal e ajustamos a aparência
 * via CSS (ver LoginModal.css).
 */
export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Entrar no QuizArenaGT"
            description="Acesse sua conta para continuar."
            header={<Logo showWordmark={false} size={52} />}
        >
            <div className="login-modal">
                <LoginForm onSuccess={onSuccess} />
            </div>
        </Modal>
    );
}
