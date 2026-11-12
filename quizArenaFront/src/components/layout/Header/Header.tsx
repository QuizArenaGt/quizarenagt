import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NavItem } from '../../../models/landing';
import { useHeaderViewModel } from '../../../viewmodels/useHeaderViewModel';
import Button from '../../ui/Button/Button';
import Icon from '../../ui/Icon/Icon';
import Logo from '../../ui/Logo/Logo';
import './Header.css';

interface HeaderProps {
    /** Links para seções da página. Omitido em páginas sem seções. */
    navItems?: NavItem[];
    /** Seção atualmente visível, destacada no menu. */
    activeSectionId?: string | null;
    /**
     * Quando informado, "Entrar" abre o login na própria página (modal).
     * Sem ele, "Entrar" navega para a rota /login existente.
     */
    onLoginClick?: () => void;
    /**
     * Substitui os botões padrão (Entrar / Começar agora).
     * Ponto de extensão previsto para a variante autenticada, que poderá
     * receber aqui o nome do usuário e o botão de sair — sem que o Header
     * precise conhecer a lógica de autenticação.
     */
    actions?: ReactNode;
}

export default function Header({ navItems = [], activeSectionId = null, onLoginClick, actions }: HeaderProps) {
    const { isMenuOpen, isScrolled, toggleMenu, closeMenu } = useHeaderViewModel();

    function handleLoginClick() {
        closeMenu();
        onLoginClick?.();
    }

    const defaultActions = (
        <>
            {onLoginClick ? (
                <Button variant="ghost" onClick={handleLoginClick}>
                    Entrar
                </Button>
            ) : (
                <Button variant="ghost" to="/login">
                    Entrar
                </Button>
            )}
            <Button to="/register">Começar agora</Button>
        </>
    );

    const headerClasses = [
        'site-header',
        isScrolled ? 'site-header--scrolled' : '',
        isMenuOpen ? 'site-header--menu-open' : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <header className={headerClasses}>
            <div className="container site-header__inner">
                <Link to="/" className="site-header__brand" aria-label="QuizArenaGT, página inicial">
                    <Logo size={36} />
                </Link>

                <button
                    type="button"
                    className="site-header__toggle"
                    aria-expanded={isMenuOpen}
                    aria-controls="site-header-menu"
                    onClick={toggleMenu}
                >
                    <Icon name={isMenuOpen ? 'close' : 'menu'} />
                    <span className="sr-only">{isMenuOpen ? 'Fechar menu' : 'Abrir menu'}</span>
                </button>

                {/* Um único bloco de navegação serve ao desktop (em linha) e
                    ao mobile (painel suspenso), evitando duplicar o menu. */}
                <div id="site-header-menu" className="site-header__menu">
                    {navItems.length > 0 && (
                        <nav aria-label="Seções da página">
                            <ul className="site-header__nav">
                                {navItems.map((item) => {
                                    const isActive = item.sectionId === activeSectionId;
                                    return (
                                        <li key={item.sectionId}>
                                            <a
                                                href={`/#${item.sectionId}`}
                                                className={`site-header__link${isActive ? ' site-header__link--active' : ''}`}
                                                aria-current={isActive ? 'location' : undefined}
                                                onClick={closeMenu}
                                            >
                                                {item.label}
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>
                    )}

                    <div className="site-header__actions">{actions ?? defaultActions}</div>
                </div>
            </div>
        </header>
    );
}
