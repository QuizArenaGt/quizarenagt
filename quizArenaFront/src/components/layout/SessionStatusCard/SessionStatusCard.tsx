import Alert from '../../ui/Alert/Alert';
import Button from '../../ui/Button/Button';
import Logo from '../../ui/Logo/Logo';
import { LoadingState } from '../../ui/Skeleton/Skeleton';
import './SessionStatusCard.css';

interface SessionStatusCardProps {
    status: 'checking' | 'error';
    onRetry?: () => void;
}

/** Estado visual padronizado da verificação e recuperação de sessão em rotas protegidas. */
export default function SessionStatusCard({
    status,
    onRetry,
}: SessionStatusCardProps) {
    return (
        <main className="session-status-page">
            <section
                className="session-status-card"
                aria-label="Status da sessão"
            >
                <Logo size={38} />

                {status === 'checking' ? (
                    <div className="session-status-card__loading">
                        <LoadingState label="Validando sua sessão…" />
                        <p className="session-status-card__hint">
                            Verificando suas credenciais com segurança.
                        </p>
                    </div>
                ) : (
                    <>
                        <Alert
                            variant="error"
                            title="Não foi possível validar sua sessão."
                        >
                            Verifique sua conexão ou se o servidor está disponível e tente novamente.
                        </Alert>

                        <div className="session-status-card__actions">
                            <Button
                                type="button"
                                size="lg"
                                fullWidth
                                onClick={onRetry}
                            >
                                Tentar novamente
                            </Button>

                            <Button
                                to="/login"
                                variant="secondary"
                                size="md"
                                fullWidth
                            >
                                Voltar ao login
                            </Button>
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}
