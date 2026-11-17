import type { ReactElement } from 'react';
import type { IconName } from '../../../models/landing';

/*
 * Conjunto pequeno de ícones SVG próprios, desenhados em grade 24x24 com
 * traço. Evita adicionar uma biblioteca de ícones ao projeto.
 */
const ICON_PATHS: Record<IconName, ReactElement> = {
    edit: (
        <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </>
    ),
    users: (
        <>
            <circle cx="9" cy="8" r="3" />
            <path d="M3 20a6 6 0 0 1 12 0" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" />
        </>
    ),
    play: <path d="M7 4.5v15l12-7.5Z" />,
    trophy: (
        <>
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
            <path d="M17 6h3v1a3 3 0 0 1-3 3" />
            <path d="M7 6H4v1a3 3 0 0 0 3 3" />
        </>
    ),
    chart: (
        <>
            <path d="M4 20h16" />
            <path d="M7 16v-5" />
            <path d="M12 16V6" />
            <path d="M17 16V9" />
        </>
    ),
    key: (
        <>
            <circle cx="8" cy="15" r="4" />
            <path d="M10.8 12.2 20 3" />
            <path d="m16 7 3 3" />
            <path d="m14 9 2 2" />
        </>
    ),
    book: (
        <>
            <path d="M4 19.5v-14A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5Z" />
            <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
        </>
    ),
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
    menu: (
        <>
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
        </>
    ),
    close: (
        <>
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
        </>
    ),
    check: <path d="m5 12.5 4.5 4.5L19 7" />,
};

interface IconProps {
    name: IconName;
    size?: number;
    className?: string;
}

/** Ícone decorativo: o significado deve estar sempre no texto ao lado. */
export default function Icon({ name, size = 24, className }: IconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            {ICON_PATHS[name]}
        </svg>
    );
}
