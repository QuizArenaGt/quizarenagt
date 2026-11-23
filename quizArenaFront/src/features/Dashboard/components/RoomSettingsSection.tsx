import Alert from '../../../components/ui/Alert/Alert';
import Button from '../../../components/ui/Button/Button';
import { GAME_MODE_LABEL, formatRoomCode, type Room } from '../../../models/room';

interface RoomSettingsSectionProps {
    room: Room;
    isFinishingMatch: boolean;
    onEditRoom: (room: Room) => void;
    onShowCode: (room: Room) => void;
    onRequestFinishMatch: (room: Room) => void;
    onRequestDeleteRoom: (room: Room) => void;
}

/** Seção de configurações e operações administrativas da sala selecionada. */
export default function RoomSettingsSection({
    room,
    isFinishingMatch,
    onEditRoom,
    onShowCode,
    onRequestFinishMatch,
    onRequestDeleteRoom,
}: RoomSettingsSectionProps) {
    const canEditSettings = room.backendStatus === 'WAITING';

    return (
        <div className="room-settings-grid">
            <section className="room-detail-card room-detail-card--surface" aria-labelledby="room-settings-general-title">
                <div>
                    <div className="room-detail-card__head">
                        <h3 id="room-settings-general-title">Configurações gerais da sala</h3>
                        <p className="room-detail-card__desc">
                            Parâmetros atuais da sala e regras de tempo e pontuação.
                        </p>
                    </div>
                    <dl className="room-settings-list">
                        <div className="room-settings-list__row">
                            <dt>Nome da sala</dt>
                            <dd>{room.name}</dd>
                        </div>
                        <div className="room-settings-list__row">
                            <dt>Tema</dt>
                            <dd>{room.theme}</dd>
                        </div>
                        <div className="room-settings-list__row">
                            <dt>Modo de jogo</dt>
                            <dd>{GAME_MODE_LABEL[room.gameMode]}</dd>
                        </div>
                        <div className="room-settings-list__row">
                            <dt>Tempo por pergunta</dt>
                            <dd>{room.timeLimit} segundos</dd>
                        </div>
                        <div className="room-settings-list__row">
                            <dt>Máximo de jogadores</dt>
                            <dd>{room.maxPlayers} participantes</dd>
                        </div>
                    </dl>
                </div>

                <div className="room-settings-card__footer">
                    {canEditSettings ? (
                        <Button
                            type="button"
                            variant="primary"
                            onClick={() => onEditRoom(room)}
                        >
                            Editar configurações da sala
                        </Button>
                    ) : (
                        <Alert variant="info">
                            As configurações gerais só podem ser editadas enquanto a sala estiver aguardando jogadores.
                        </Alert>
                    )}
                </div>
            </section>

            <section className="room-detail-card room-detail-card--surface" aria-labelledby="room-settings-access-title">
                <div>
                    <div className="room-detail-card__head">
                        <h3 id="room-settings-access-title">Código de acesso e administração</h3>
                        <p className="room-detail-card__desc">
                            Compartilhe o código <strong>{formatRoomCode(room.code)}</strong> em{' '}
                            <strong>/jogar</strong> para entrada dos participantes.
                        </p>
                    </div>
                </div>

                <div className="room-settings-actions">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onShowCode(room)}
                    >
                        Projetar código em tela cheia
                    </Button>

                    {room.backendStatus === 'IN_PROGRESS' && (
                        <Button
                            type="button"
                            variant="danger"
                            disabled={isFinishingMatch}
                            isLoading={isFinishingMatch}
                            onClick={() => onRequestFinishMatch(room)}
                        >
                            {isFinishingMatch ? 'Encerrando Partida…' : 'Encerrar Partida'}
                        </Button>
                    )}

                    <div className="room-settings-danger-zone">
                        <p className="room-detail-empty-hint">
                            Excluir uma sala remove-a da listagem ativa, mantendo o histórico de partidas anteriores.
                        </p>
                        <Button
                            type="button"
                            variant="danger"
                            onClick={() => onRequestDeleteRoom(room)}
                        >
                            Excluir sala
                        </Button>
                    </div>
                </div>
            </section>
        </div>
    );
}
