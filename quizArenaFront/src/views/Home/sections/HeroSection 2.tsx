import Button from '../../../components/ui/Button/Button';
import HeroIllustration from './HeroIllustration';

interface HeroSectionProps {
    joinRoomSectionId: string;
    onLoginClick: () => void;
}

export default function HeroSection({ joinRoomSectionId, onLoginClick }: HeroSectionProps) {
    return (
        <section className="home-hero" aria-labelledby="home-hero-title">
            <div className="container home-hero__grid">
                <div className="home-hero__content">
                    <p className="home-hero__eyebrow">Plataforma de quizzes interativos</p>

                    <h1 id="home-hero-title" className="home-hero__title">
                        Transforme conhecimento em <span className="home-hero__highlight">diversão!</span>
                    </h1>

                    <p className="home-hero__text">
                        No QuizArenaGT, o professor cria quizzes e a turma inteira joga ao mesmo tempo,
                        entrando na sala com um código. Aprender fica mais participativo — e competitivo
                        na medida certa.
                    </p>

                    <div className="home-hero__actions">
                        <Button to="/register" size="lg">
                            Começar agora
                        </Button>
                        <Button href={`#${joinRoomSectionId}`} variant="secondary" size="lg">
                            Entrar em uma sala
                        </Button>
                    </div>

                    <p className="home-hero__login">
                        Já tem uma conta?{' '}
                        <button type="button" className="home-hero__login-button" onClick={onLoginClick}>
                            Entrar
                        </button>
                    </p>
                </div>

                <HeroIllustration />
            </div>
        </section>
    );
}
