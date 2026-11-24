import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Badge, { type BadgeVariant } from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import Icon, { type IconName } from '../../../components/ui/Icon/Icon';
import { buildProjectionRoute } from '../../../models/projection';
import {
    GAME_MODE_LABEL,
    formatRoomCode,
    getClipboardRoomCode,
    type Room,
} from '../../../models/room';

export type RoomSectionId = 'overview' | 'questions' | 'games' | 'settings';

interface RoomSectionNavItem {
    id: RoomSectionId;
    label: string;
    icon: IconName;
    badge?: number;
}

interface RoomWorkspaceShellProps {
    room: Room;
    activeSection: RoomSectionId;
    questionCount: number;
    gamesCount: number;
    onSelectSection: (section: RoomSectionId) => void;
    onBackToList: () => void;
    onShowCode: (room: Room) => void;
    children: ReactNode;
}

const ROOM_STATUS_BADGE: Record<Room['status'], BadgeVariant> = {
    Aguardando: 'warning',
    'Em Andamento': 'success',
    Finalizado: 'neutral',
};

/**
 * Contexto dedicado de gerenciamento da sala selecionada:
 * breadcrumb de retorno, hierarquia do cabeçalho, acesso ao código e navegação interna.
 */
export default function RoomWorkspaceShell({
    room,
    activeSection,
    questionCount,
    gamesCount,
    onSelectSection,
    onBackToList,
    onShowCode,
    children,
}: RoomWorkspaceShellProps) {
    const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
    const subnavRef = useRef<HTMLElement | null>(null);

    const copiedCode = copiedRoomId === room.id;

    useEffect(() => {
        if (!copiedRoomId) return;
        const timer = window.setTimeout(() => setCopiedRoomId(null), 2000);
        return () => window.clearTimeout(timer);
    }, [copiedRoomId]);

    async function handleCopyCode() {
        const cleanCode = getClipboardRoomCode(room.code);
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(cleanCode);
            }
            setCopiedRoomId(room.id);
        } catch {
            setCopiedRoomId(null);
        }
    }

    function handleOpenProjection() {
        const projectionPath = buildProjectionRoute(room.code);
        if (typeof window !== 'undefined') {
            window.open(projectionPath, '_blank', 'noopener,noreferrer');
        }
    }

    function handleSubnavKeyDown(event: KeyboardEvent<HTMLElement>) {
        const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(event.key)) return;

        const buttons = Array.from(
            subnavRef.current?.querySelectorAll<HTMLButtonElement>('button.room-subnav__item') ?? [],
        );
        if (buttons.length === 0) return;

        const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (currentIndex === -1) return;

        event.preventDefault();
        let nextIndex = currentIndex;
        if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % buttons.length;
        } else if (event.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = buttons.length - 1;
        }

        buttons[nextIndex]?.focus();
    }

    const sectionItems: RoomSectionNavItem[] = [
        { id: 'overview', label: 'Visão geral', icon: 'dashboard' },
        { id: 'questions', label: 'Perguntas', icon: 'questions', badge: questionCount },
        { id: 'games', label: 'Partidas', icon: 'trophy', badge: gamesCount },
        { id: 'settings', label: 'Configurações', icon: 'settings' },
    ];

    return (
        <section className="room-workspace" aria-label={`Gerenciamento da sala ${room.name}`}>
            <div className="room-workspace-breadcrumb">
                <button
                    type="button"
                    className="room-back-btn"
                    onClick={onBackToList}
                >
                    ← Voltar para Salas
                </button>
                <span className="room-breadcrumb-separator" aria-hidden="true">
                    /
                </span>
                <span className="room-breadcrumb-current">{room.name}</span>
            </div>

            <header className="room-workspace-header">
                <div className="room-workspace-header__identity">
                    <div className="room-workspace-header__title-row">
                        <h2>{room.name}</h2>
                        <Badge variant={ROOM_STATUS_BADGE[room.status]}>
                            {room.status}
                        </Badge>
                    </div>
                    <ul className="room-workspace-meta" aria-label="Resumo da sala">
                        <li>
                            <span className="room-workspace-meta__label">Tema:</span>{' '}
                            <strong>{room.theme}</strong>
                        </li>
                        <li>
                            <span className="room-workspace-meta__label">Modo:</span>{' '}
                            <strong>{GAME_MODE_LABEL[room.gameMode]}</strong>
                        </li>
                        <li>
                            <span className="room-workspace-meta__label">Tempo:</span>{' '}
                            <strong>{room.timeLimit}s / questão</strong>
                        </li>
                        <li>
                            <span className="room-workspace-meta__label">Capacidade:</span>{' '}
                            <strong>{room.maxPlayers} jogadores</strong>
                        </li>
                    </ul>
                </div>

                <div className="room-access-card">
                    <div className="room-access-card__top">
                        <div className="room-access-card__code-group">
                            <span className="room-access-card__label">Código de acesso</span>
                            <strong className="room-access-card__value">
                                {formatRoomCode(room.code)}
                            </strong>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="room-access-card__copy-btn"
                            onClick={() => void handleCopyCode()}
                        >
                            <Icon name="copy" size={15} />
                            <span>{copiedCode ? 'Copiado!' : 'Copiar'}</span>
                        </Button>
                    </div>
                    <div className="room-access-card__projection-group" role="group" aria-label="Ações de exibição da sala">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="room-access-card__proj-btn room-access-card__proj-btn--share"
                            onClick={() => onShowCode(room)}
                        >
                            <Icon name="key" size={15} />
                            <span>Compartilhar código</span>
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="room-access-card__proj-btn room-access-card__proj-btn--present"
                            onClick={handleOpenProjection}
                        >
                            <Icon name="rooms" size={15} />
                            <span>Abrir projeção</span>
                        </Button>
                    </div>
                </div>
            </header>

            <nav
                ref={subnavRef}
                className="room-subnav"
                aria-label="Navegação interna da sala"
                onKeyDown={handleSubnavKeyDown}
            >
                {sectionItems.map((item) => {
                    const isActive = activeSection === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={`room-subnav__item${isActive ? ' is-active' : ''}`}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => onSelectSection(item.id)}
                        >
                            <Icon name={item.icon} size={16} />
                            <span>{item.label}</span>
                            {item.badge !== undefined && (
                                <span className="room-subnav__badge">{item.badge}</span>
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="room-workspace-body">{children}</div>
        </section>
    );
}
