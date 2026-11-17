/*
 * MODEL — salas criadas pelo professor.
 *
 * O backend ainda não possui salas; este tipo é a proposta do frontend.
 * Os valores de status foram mantidos iguais aos que o Dashboard já usava.
 */
import { DEMO_ROOM_PIN, PIN_LENGTH } from './game';

export type RoomStatus = 'Aguardando' | 'Em Andamento' | 'Finalizado';

export interface Room {
    id: string;
    name: string;
    theme: string;
    /** Tempo para responder cada pergunta, em segundos. */
    timeLimit: number;
    status: RoomStatus;
    /** Código que os alunos digitam para entrar (6 dígitos). */
    code: string;
    /** Perguntas escolhidas pelo professor, na ordem em que serão jogadas. */
    questionIds: string[];
}

/** Uma sala precisa de pelo menos uma pergunta para ser criada. */
export const MIN_ROOM_QUESTIONS = 1;

export const ROOM_TIME_OPTIONS = [15, 30, 45, 60] as const;

/**
 * Gera um código de sala de 6 dígitos que ainda não esteja em uso.
 * Regras: não começa com zero (evita confusão ao ditar o código) e nunca
 * repete o código da sala de demonstração nem o de outra sala.
 */
export function generateRoomCode(codesInUse: string[]): string {
    const reserved = new Set([...codesInUse, DEMO_ROOM_PIN]);
    const min = 10 ** (PIN_LENGTH - 1);
    const max = 10 ** PIN_LENGTH - 1;

    let code: string;
    do {
        code = String(Math.floor(min + Math.random() * (max - min + 1)));
    } while (reserved.has(code));

    return code;
}

/** Exibe o código em dois blocos (ex.: "482 913"), mais fácil de ler na projeção. */
export function formatRoomCode(code: string): string {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Alunos só podem entrar em salas que ainda não foram encerradas. */
export function isRoomOpen(room: Room): boolean {
    return room.status !== 'Finalizado';
}
