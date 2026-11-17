import { PIN_LENGTH } from './game';
import type { BackendRoomStatus, GameMode, LobbyPlayerDto } from '../services/socket';

export type RoomStatus = 'Aguardando' | 'Em Andamento' | 'Finalizado';

export interface Room {
    id: string;
    name: string;
    theme: string;
    /** Tempo para responder cada pergunta, em segundos (questionTime no backend). */
    timeLimit: number;
    maxPlayers: number;
    gameMode: GameMode;
    status: RoomStatus;
    backendStatus: BackendRoomStatus;
    /** Código alfanumérico de 6 caracteres gerado pelo backend. */
    code: string;
    /** IDs das perguntas vinculadas à sala. */
    questionIds: string[];
    players: LobbyPlayerDto[];
}

/** Uma sala precisa de pelo menos 5 perguntas ativas para iniciar no backend. */
export const MIN_ROOM_QUESTIONS = 5;
export const MIN_ROOM_PLAYERS = 2;

export const ROOM_TIME_OPTIONS = [15, 30, 45, 60] as const;

export const GAME_MODE_LABEL: Record<GameMode, string> = {
    CLASSIC: 'Clássico (sem perda de pontos)',
    HARDCORE: 'Hardcore (-30 pts ao errar)',
};

export function mapBackendRoomStatus(status: BackendRoomStatus): RoomStatus {
    switch (status) {
        case 'WAITING':
            return 'Aguardando';
        case 'IN_PROGRESS':
            return 'Em Andamento';
        case 'FINISHED':
        case 'CANCELLED':
            return 'Finalizado';
    }
}

/** Exibe o código em dois blocos (ex.: "482 913" ou "A1B 2C3"), mais fácil de ler na projeção. */
export function formatRoomCode(code: string): string {
    const clean = code.trim().toUpperCase();
    if (clean.length <= 3) return clean;
    return `${clean.slice(0, 3)} ${clean.slice(3, PIN_LENGTH)}`;
}

/** Alunos só podem entrar em salas que ainda estão aguardando início. */
export function isRoomOpen(room: Room): boolean {
    return room.backendStatus === 'WAITING' && room.status === 'Aguardando';
}
