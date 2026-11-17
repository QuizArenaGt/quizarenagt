/*
 * SERVICE TEMPORÁRIO — salas no navegador.
 *
 * Enquanto o backend não possui salas, elas ficam no localStorage, para
 * que o código gerado no painel do professor possa ser usado na tela do
 * aluno (/jogar) no MESMO navegador. Quando houver API (ex.: GET/POST
 * /rooms), basta trocar estas funções mantendo as assinaturas.
 */
import type { Room } from '../models/room';

const STORAGE_KEY = 'quizarena:rooms';

/** Salas de exemplo que já existiam fixas no Dashboard, agora com código. */
const ROOM_SEEDS: Room[] = [
    {
        id: 'seed-room-tech',
        name: 'Arena Tech 01',
        theme: 'Programação & Web',
        timeLimit: 30,
        status: 'Aguardando',
        code: '482913',
        questionIds: ['seed-react-effects', 'seed-css', 'seed-html', 'seed-typescript'],
    },
    {
        id: 'seed-room-geek',
        name: 'Desafio Geek',
        theme: 'Cultura Pop',
        timeLimit: 20,
        status: 'Em Andamento',
        code: '730254',
        questionIds: ['seed-css', 'seed-html'],
    },
];

function isRoomList(value: unknown): value is Room[] {
    return (
        Array.isArray(value) &&
        value.every(
            (item) =>
                typeof item === 'object' &&
                item !== null &&
                typeof item.name === 'string' &&
                typeof item.code === 'string',
        )
    );
}

export function loadRooms(): Room[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed: unknown = JSON.parse(stored);
            if (isRoomList(parsed)) {
                // Salas salvas antes da seleção de perguntas não têm a lista;
                // nesse caso usam todas as perguntas ativas (ver gameRoomService).
                return parsed.map((room) => ({
                    ...room,
                    questionIds: Array.isArray(room.questionIds) ? room.questionIds : [],
                }));
            }
        }
    } catch {
        // Dado corrompido ou localStorage indisponível: volta aos exemplos.
    }
    return ROOM_SEEDS.map((room) => ({ ...room }));
}

export function saveRooms(rooms: Room[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    } catch {
        // Sem espaço ou sem permissão: as alterações valem só até recarregar.
    }
}

export function findRoomByCode(code: string): Room | undefined {
    return loadRooms().find((room) => room.code === code);
}
