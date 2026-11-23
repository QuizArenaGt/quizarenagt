import { useState } from 'react';
import Alert from '../../../components/ui/Alert/Alert';
import Badge, { type BadgeVariant } from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import EmptyState from '../../../components/ui/EmptyState/EmptyState';
import Icon from '../../../components/ui/Icon/Icon';
import { LoadingState } from '../../../components/ui/Skeleton/Skeleton';
import {
    GAME_MODE_LABEL,
    countEligiblePlayers,
    filterRoomsByName,
    type Room,
} from '../../../models/room';

interface RoomDiscoveryListProps {
    rooms: Room[];
    activeRoomId: string | null;
    activeRoomQuestionCount: number;
    isLoadingHostRooms: boolean;
    roomActionError: string | null;
    hostRoomsError: string | null;
    onReloadHostRooms: () => void;
    onCreateRoom: () => void;
    onOpenRoom: (room: Room) => void;
}

const ROOM_STATUS_BADGE: Record<Room['status'], BadgeVariant> = {
    Aguardando: 'warning',
    'Em Andamento': 'success',
    Finalizado: 'neutral',
};

/** Listagem simples de descoberta, pesquisa por nome e seleção de salas. */
export default function RoomDiscoveryList({
    rooms,
    activeRoomId,
    activeRoomQuestionCount,
    isLoadingHostRooms,
    roomActionError,
    hostRoomsError,
    onReloadHostRooms,
    onCreateRoom,
    onOpenRoom,
}: RoomDiscoveryListProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredRooms = filterRoomsByName(rooms, searchQuery);
    const hasSearchFilter = searchQuery.trim().length > 0;

    return (
        <div>
            <div className="rooms-toolbar">
                <div className="rooms-toolbar__heading">
                    <h2>Suas Salas</h2>
                    <p>
                        {rooms.length === 0
                            ? 'Crie uma nova sala para organizar perguntas e conduzir partidas.'
                            : hasSearchFilter
                              ? `Exibindo ${filteredRooms.length} de ${rooms.length} ${rooms.length === 1 ? 'sala' : 'salas'}.`
                              : `${rooms.length} ${rooms.length === 1 ? 'sala disponível' : 'salas disponíveis'}. Abra uma sala para gerenciar lobby, perguntas e partidas.`}
                    </p>
                </div>
                <div className="rooms-toolbar__actions">
                    {rooms.length > 0 && (
                        <div className="rooms-search-field">
                            <span className="rooms-search-field__icon" aria-hidden="true">
                                <Icon name="search" size={16} />
                            </span>
                            <input
                                type="search"
                                className="rooms-search-input"
                                aria-label="Pesquisar sala pelo nome"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Pesquisar por nome…"
                            />
                            {searchQuery.length > 0 && (
                                <button
                                    type="button"
                                    className="rooms-search-clear"
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Limpar pesquisa"
                                >
                                    <Icon name="close" size={14} />
                                </button>
                            )}
                        </div>
                    )}
                    <Button type="button" variant="primary" onClick={onCreateRoom}>
                        + Criar Nova Sala
                    </Button>
                </div>
            </div>

            {roomActionError && (
                <Alert variant="error" className="room-form-error">
                    {roomActionError}
                </Alert>
            )}

            {hostRoomsError && (
                <Alert variant="error" className="room-form-error">
                    <div className="room-error-banner-row">
                        <span>{hostRoomsError}</span>
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={onReloadHostRooms}
                        >
                            Tentar novamente
                        </Button>
                    </div>
                </Alert>
            )}

            {isLoadingHostRooms && rooms.length === 0 ? (
                <div className="room-detail-panel">
                    <LoadingState label="Carregando suas salas…" />
                </div>
            ) : rooms.length === 0 ? (
                <EmptyState
                    icon="rooms"
                    title="Nenhuma sala criada ainda"
                    description="Clique em + Criar Nova Sala para configurar sua primeira arena e cadastrar perguntas."
                    action={
                        <Button type="button" onClick={onCreateRoom}>
                            + Criar Nova Sala
                        </Button>
                    }
                />
            ) : filteredRooms.length === 0 ? (
                <EmptyState
                    icon="search"
                    title="Nenhuma sala encontrada"
                    description={`Não encontramos nenhuma sala com o nome "${searchQuery.trim()}".`}
                    action={
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setSearchQuery('')}
                        >
                            Limpar pesquisa
                        </Button>
                    }
                />
            ) : (
                <div className="rooms-discovery-grid">
                    {filteredRooms.map((room) => {
                        const isLastFocused = activeRoomId === room.id;
                        const activePlayers = countEligiblePlayers(room.players);
                        const knownQuestionsCount = isLastFocused
                            ? activeRoomQuestionCount
                            : room.questionIds.length > 0
                              ? room.questionIds.length
                              : null;

                        return (
                            <article
                                key={room.id}
                                className={`room-card room-card--discovery${isLastFocused ? ' room-card--selected' : ''}`}
                            >
                                <div className="room-info">
                                    <div className="room-info__top">
                                        <span className="room-theme">
                                            {room.theme} · {GAME_MODE_LABEL[room.gameMode]}
                                        </span>
                                        <Badge variant={ROOM_STATUS_BADGE[room.status]}>
                                            {room.status}
                                        </Badge>
                                    </div>
                                    <h3>{room.name}</h3>
                                    <p>
                                        Participantes: <strong>{activePlayers}</strong> / {room.maxPlayers} · Tempo:{' '}
                                        <strong>{room.timeLimit}s</strong>
                                    </p>
                                    {knownQuestionsCount !== null && (
                                        <p>
                                            Perguntas na sala: <strong>{knownQuestionsCount}</strong>
                                        </p>
                                    )}
                                </div>

                                <div className="room-actions">
                                    <button
                                        type="button"
                                        className="room-open-btn"
                                        onClick={() => onOpenRoom(room)}
                                    >
                                        Gerenciar sala
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
