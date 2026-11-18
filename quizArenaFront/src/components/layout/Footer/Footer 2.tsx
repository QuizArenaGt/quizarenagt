import { Link } from 'react-router-dom';
import { NAV_ITEMS, PROJECT_INFO } from '../../../models/landingContent';
import Logo from '../../ui/Logo/Logo';
import './Footer.css';

/*
 * Rodapé padrão. Contém apenas links internos e informações do projeto:
 * propositalmente não há redes sociais nem contatos, pois o projeto não
 * possui esses dados oficiais.
 */
export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="site-footer">
            <div className="container site-footer__grid">
                <div className="site-footer__about">
                    <Logo variant="dark" size={36} />
                    <p className="site-footer__description">{PROJECT_INFO.description}</p>
                </div>

                <nav className="site-footer__column" aria-label="Plataforma">
                    <h2 className="site-footer__heading">Plataforma</h2>
                    <ul className="site-footer__links">
                        {NAV_ITEMS.map((item) => (
                            <li key={item.sectionId}>
                                <a href={`/#${item.sectionId}`} className="site-footer__link">
                                    {item.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>

                <nav className="site-footer__column" aria-label="Conta">
                    <h2 className="site-footer__heading">Conta</h2>
                    <ul className="site-footer__links">
                        <li>
                            <Link to="/login" className="site-footer__link">
                                Entrar
                            </Link>
                        </li>
                        <li>
                            <Link to="/register" className="site-footer__link">
                                Criar conta
                            </Link>
                        </li>
                    </ul>
                </nav>
            </div>

            <div className="container site-footer__bottom">
                <p>
                    © {currentYear} {PROJECT_INFO.name}. {PROJECT_INFO.academicNote}
                </p>
                <p>Uso educacional, sem fins comerciais.</p>
            </div>
        </footer>
    );
}
