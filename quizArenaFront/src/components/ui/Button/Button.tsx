import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'md' | 'lg';

interface BaseButtonProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    children: ReactNode;
    className?: string;
}

/*
 * O mesmo visual de botão é usado em três situações, escolhidas pelas
 * props recebidas:
 *  - `to`   → navegação interna com o <Link> do React Router;
 *  - `href` → âncora comum (ex.: "#secao");
 *  - nenhum → <button>, para ações na própria página.
 * Assim a semântica HTML fica correta sem duplicar estilos.
 */
type ButtonAsButton = BaseButtonProps &
    ButtonHTMLAttributes<HTMLButtonElement> & { to?: never; href?: never };

type ButtonAsRouterLink = BaseButtonProps &
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; href?: never };

type ButtonAsAnchor = BaseButtonProps &
    AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; to?: never };

export type ButtonProps = ButtonAsButton | ButtonAsRouterLink | ButtonAsAnchor;

export default function Button(props: ButtonProps) {
    const {
        variant = 'primary',
        size = 'md',
        fullWidth = false,
        className = '',
        children,
        ...rest
    } = props;

    const classes = [
        'ui-button',
        `ui-button--${variant}`,
        `ui-button--${size}`,
        fullWidth ? 'ui-button--full' : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    if ('to' in rest && rest.to !== undefined) {
        const { to, ...linkProps } = rest;
        return (
            <Link to={to} className={classes} {...linkProps}>
                {children}
            </Link>
        );
    }

    if ('href' in rest && rest.href !== undefined) {
        return (
            <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
                {children}
            </a>
        );
    }

    const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
    return (
        <button type="button" className={classes} {...buttonProps}>
            {children}
        </button>
    );
}
