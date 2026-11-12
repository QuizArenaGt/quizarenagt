import { useState } from 'react';
import Button from '../../../components/ui/Button/Button';
import Modal from '../../../components/ui/Modal/Modal';
import { formatRoomCode, type Room } from '../../../models/room';
import './RoomCodeModal.css';

interface RoomCodeModalProps {
    room: Room | null;
    onClose: () => void;
}

/**
 * VIEW — exibe o código da sala em destaque, para o professor projetar
 * na sala de aula. Mostra também o endereço onde os alunos devem entrar.
 */
export default function RoomCodeModal({ room, onClose }: RoomCodeModalProps) {
    return (
        <Modal
            isOpen={room !== null}
            onClose={onClose}
            size="lg"
            title={room?.name ?? ''}
            description="Mostre esta tela para a turma."
        >
            {room && <RoomCodeContent room={room} onClose={onClose} />}
        </Modal>
    );
}

function RoomCodeContent({ room, onClose }: { room: Room; onClose: () => void }) {
    // Estado puramente visual (aviso de "copiado"), por isso fica na View.
    const [copied, setCopied] = useState(false);
    const joinAddress = `${window.location.host}/jogar`;

    async function copyCode() {
        try {
            await navigator.clipboard.writeText(room.code);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    }

    return (
        <div className="room-code">
            <p className="room-code__instruction">
                Acesse <strong>{joinAddress}</strong> e digite o código:
            </p>

            <p className="room-code__value" aria-label={`Código da sala: ${room.code.split('').join(' ')}`}>
                {formatRoomCode(room.code)}
            </p>

            <ul className="room-code__details">
                <li>{room.theme}</li>
                <li>{room.timeLimit} segundos por pergunta</li>
                <li>{room.status}</li>
            </ul>

            <p className="room-code__note">
                Enquanto as salas não estão no servidor, o código funciona apenas neste navegador.
            </p>

            <div className="room-code__actions">
                <Button variant="secondary" onClick={copyCode}>
                    {copied ? 'Código copiado!' : 'Copiar código'}
                </Button>
                <Button onClick={onClose}>Fechar</Button>
            </div>
            {/* Anuncia a confirmação de cópia para leitores de tela */}
            <p className="sr-only" role="status">
                {copied ? 'Código copiado para a área de transferência.' : ''}
            </p>
        </div>
    );
}
