import { Link } from 'react-router-dom';
import Icon from '../../ui/Icon/Icon';
import Logo from '../../ui/Logo/Logo';
import './AuthBrandPanel.css';

interface AuthBrandPanelProps {
    /** Título exibido acima do formulário (ex.: "Bem-vindo de volta!"). */
    title?: string;
    /** Texto de apoio abaixo do título. */
    description?: string;
}

/*
 * Componente de APRESENTAÇÃO das telas de autenticação (login, cadastro e
 * recuperação de senha).
 *
 * Substitui apenas o antigo bloco do logotipo (escudo + "QUIZ ARENA").
 * Retorna dois elementos irmãos:
 *  - .auth-brand: painel lateral com a identidade visual;
 *  - .auth-form-header: título acima do formulário.
 * O posicionamento lado a lado é feito por CSS Grid no LoginForm.css, para
 * que os formulários existentes (e sua lógica) não precisem ser
 * reestruturados.
 */
export default function AuthBrandPanel({ title, description }: AuthBrandPanelProps) {
    return (
        <>
            <aside className="auth-brand" aria-label="QuizArenaGT">
                <Link to="/" className="auth-brand__logo" aria-label="QuizArenaGT, página inicial">
                    <Logo variant="dark" withBadge size={40} />
                </Link>

                <div className="auth-brand__content">
                    <p className="auth-brand__headline">
                        Transforme conhecimento em <span>diversão!</span>
                    </p>
                    <p className="auth-brand__text">
                        Quizzes interativos para a turma inteira aprender jogando junto.
                    </p>

                    {/* Elemento decorativo que remete às alternativas de um quiz */}
                    <ul className="auth-brand__options" aria-hidden="true">
                        <li><span>A</span></li>
                        <li className="auth-brand__option--correct"><span>B</span><Icon name="check" size={16} /></li>
                        <li><span>C</span></li>
                        <li><span>D</span></li>
                    </ul>
                </div>

                <Link to="/" className="auth-brand__back">
                    ← Voltar ao início
                </Link>
            </aside>

            {title && (
                <header className="auth-form-header">
                    <h1 className="auth-form-header__title">{title}</h1>
                    {description && <p className="auth-form-header__text">{description}</p>}
                </header>
            )}
        </>
    );
}
