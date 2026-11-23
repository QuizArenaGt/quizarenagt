import type { ReactElement } from 'react';
import type { IconName as LandingIconName } from '../../../models/landing';

export type IconName =
    | LandingIconName
    | 'dashboard'
    | 'rooms'
    | 'questions'
    | 'pause'
    | 'timer'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'import'
    | 'delete'
    | 'copy'
    | 'search'
    | 'settings'
    | 'logout';

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
    pause: (
        <>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
        </>
    ),
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
    dashboard: (
        <>
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </>
    ),
    rooms: (
        <>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8" />
            <path d="M12 16v4" />
        </>
    ),
    questions: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2.2-2.4 3.7" />
            <path d="M12 17.5h.01" />
        </>
    ),
    timer: (
        <>
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 1.5" />
            <path d="M10 2h4" />
        </>
    ),
    success: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="m9 12 2 2 4-4" />
        </>
    ),
    warning: (
        <>
            <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 16.5h.01" />
        </>
    ),
    error: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
        </>
    ),
    info: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 8h.01" />
        </>
    ),
    import: (
        <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
        </>
    ),
    delete: (
        <>
            <path d="M3 6h18" />
            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        </>
    ),
    copy: (
        <>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </>
    ),
    settings: (
        <>
            <path d="M4 21v-7" />
            <path d="M4 10V3" />
            <path d="M12 21v-9" />
            <path d="M12 8V3" />
            <path d="M20 21v-5" />
            <path d="M20 12V3" />
            <path d="M2 14h4" />
            <path d="M10 8h4" />
            <path d="M18 16h4" />
        </>
    ),
    logout: (
        <>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
        </>
    ),
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
