import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { getInitials } from '../../../models/profile';
import Badge, { type BadgeVariant } from '../../ui/Badge/Badge';
import Icon, { type IconName } from '../../ui/Icon/Icon';
import Logo from '../../ui/Logo/Logo';
import './DashboardShell.css';

export type DashboardTabId = 'overview' | 'rooms';

export interface DashboardNavItem {
    id: DashboardTabId;
    label: string;
    icon: IconName;
    badge?: number | string;
}

export interface DashboardActiveRoomSummary {
    name: string;
    code: string;
    statusLabel: string;
    statusVariant: BadgeVariant;
}

interface DashboardShellProps {
    navItems: DashboardNavItem[];
    activeTab: DashboardTabId;
    onSelectTab: (tab: DashboardTabId) => void;
    title: string;
    subtitle?: string;
    activeRoomSummary?: DashboardActiveRoomSummary | null;
    isManagingActiveRoom?: boolean;
    onOpenActiveRoom?: () => void;
    userDisplayName: string;
    userRoleLabel: string;
    isProfileAvailable: boolean;
    onOpenProfile: () => void;
    onLogout: () => void;
    children: ReactNode;
}

/**
 * Shell estrutural autenticado do QuizArena: sidebar fixa no desktop,
 * drawer recolhível no mobile/tablet, header contextual e área de conteúdo.
 */
export default function DashboardShell({
    navItems,
    activeTab,
    onSelectTab,
    title,
    subtitle,
    activeRoomSummary,
    isManagingActiveRoom = false,
    onOpenActiveRoom,
    userDisplayName,
    userRoleLabel,
    isProfileAvailable,
    onOpenProfile,
    onLogout,
    children,
}: DashboardShellProps) {
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
    const navListRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isMobileNavOpen) return;

        function handleKeyDown(event: globalThis.KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsMobileNavOpen(false);
                menuTriggerRef.current?.focus();
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMobileNavOpen]);

    function handleSelectNavItem(tab: DashboardTabId) {
        onSelectTab(tab);
        setIsMobileNavOpen(false);
    }

    function handleNavKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

        const buttons = Array.from(
            navListRef.current?.querySelectorAll<HTMLButtonElement>('button.nav-item') ?? [],
        );
        if (buttons.length === 0) return;

        const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (currentIndex === -1) return;

        event.preventDefault();
        const nextIndex =
            event.key === 'ArrowDown'
                ? (currentIndex + 1) % buttons.length
                : (currentIndex - 1 + buttons.length) % buttons.length;
        buttons[nextIndex]?.focus();
    }

    function handleCloseMobileNav() {
        setIsMobileNavOpen(false);
        menuTriggerRef.current?.focus();
    }

    return (
        <div className="dashboard-shell">
            {isMobileNavOpen && (
                <div
                    className="dashboard-drawer-backdrop"
                    aria-hidden="true"
                    onClick={handleCloseMobileNav}
                />
            )}

            <aside
                id="dashboard-sidebar"
                className={`dashboard-sidebar${isMobileNavOpen ? ' is-open' : ''}`}
                aria-label="Navegação lateral do painel"
            >
                <div className="dashboard-sidebar__top">
                    <div className="sidebar-header">
                        <div className="sidebar-header__brand">
                            <Logo size={34} />
                            <p className="sidebar-header__role">Painel do Anfitrião</p>
                        </div>
                        <button
                            type="button"
                            className="sidebar-close-btn"
                            onClick={handleCloseMobileNav}
                            aria-label="Fechar menu de navegação"
                        >
                            <Icon name="close" size={18} />
                        </button>
                    </div>

                    <div className="sidebar-nav-section">
                        <p className="sidebar-nav-label">Menu principal</p>
                        <nav
                            ref={navListRef}
                            className="sidebar-nav"
                            aria-label="Áreas do painel"
                            onKeyDown={handleNavKeyDown}
                        >
                            {navItems.map((item) => {
                                const isActive = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`nav-item${isActive ? ' active' : ''}`}
                                        aria-current={isActive ? 'page' : undefined}
                                        onClick={() => handleSelectNavItem(item.id)}
                                    >
                                        <span className="nav-item__icon" aria-hidden="true">
                                            <Icon name={item.icon} size={18} />
                                        </span>
                                        <span className="nav-item__label">{item.label}</span>
                                        {item.badge !== undefined && (
                                            <span className="nav-item__badge">{item.badge}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    {activeRoomSummary && (
                        <button
                            type="button"
                            className={`sidebar-active-room${isManagingActiveRoom ? ' is-current' : ''}`}
                            onClick={() => {
                                if (onOpenActiveRoom) {
                                    onOpenActiveRoom();
                                    setIsMobileNavOpen(false);
                                } else {
                                    handleSelectNavItem('rooms');
                                }
                            }}
                            aria-label={`Abrir sala em contexto ${activeRoomSummary.name}`}
                        >
                            <span className="sidebar-active-room__eyebrow">
                                {isManagingActiveRoom ? 'Administrando agora' : 'Sala em foco'}
                            </span>
                            <span className="sidebar-active-room__name">{activeRoomSummary.name}</span>
                            <span className="sidebar-active-room__meta">
                                <span className="sidebar-active-room__code">
                                    {isManagingActiveRoom ? 'Em gerenciamento' : 'Abrir sala →'}
                                </span>
                                <Badge variant={activeRoomSummary.statusVariant}>
                                    {activeRoomSummary.statusLabel}
                                </Badge>
                            </span>
                        </button>
                    )}
                </div>

                <div className="sidebar-footer">
                    <button
                        type="button"
                        className="logout-btn"
                        onClick={() => {
                            setIsMobileNavOpen(false);
                            onLogout();
                        }}
                    >
                        <Icon name="logout" size={18} />
                        <span>Sair da Conta</span>
                    </button>
                </div>
            </aside>

            <div className="dashboard-main">
                <header className="main-header">
                    <div className="main-header__inner">
                        <div className="main-header__title-group">
                            <button
                                ref={menuTriggerRef}
                                type="button"
                                className="mobile-nav-trigger"
                                onClick={() => setIsMobileNavOpen(true)}
                                aria-label="Abrir menu de navegação"
                                aria-expanded={isMobileNavOpen}
                                aria-controls="dashboard-sidebar"
                            >
                                <Icon name="menu" size={20} />
                            </button>

                            <div className="main-header__titles">
                                <h1>{title}</h1>
                                {subtitle && (
                                    <p className="main-header__subtitle">{subtitle}</p>
                                )}
                            </div>
                        </div>

                        <div className="main-header__actions">
                            <button
                                type="button"
                                className="user-profile"
                                onClick={onOpenProfile}
                                aria-label={`Abrir perfil de ${userDisplayName}`}
                                disabled={!isProfileAvailable}
                            >
                                <span className="user-profile__avatar" aria-hidden="true">
                                    {getInitials(userDisplayName)}
                                </span>
                                <span className="user-profile__meta">
                                    <span className="user-profile__name">{userDisplayName}</span>
                                    <span className="user-profile__role">{userRoleLabel}</span>
                                </span>
                            </button>
                        </div>
                    </div>
                </header>

                <main className="main-content">{children}</main>
            </div>
        </div>
    );
}
