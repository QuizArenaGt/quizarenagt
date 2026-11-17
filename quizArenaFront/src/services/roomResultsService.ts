/*
 * SERVICE TEMPORÁRIO — resultados das salas no navegador.
 *
 * Registra o resultado de cada aluno que conclui uma partida em uma sala
 * do professor, para o relatório da sala finalizada. Também guarda os
 * jogadores simulados de cada sala, para que todos os alunos (e o
 * professor) vejam a mesma turma.
 *
 * Com o backend, estes dados virão do servidor (ex.: GET /rooms/:id/results).
 */
import type { OpponentPlayer } from '../models/game';
import type { PlayerResult, RoomResults } from '../models/roomReport';
import { simulatePlayers } from './mock/simulatedPlayers';

const STORAGE_KEY = 'quizarena:room-results';

type ResultsStore = Record<string, RoomResults>;

function readStore(): ResultsStore {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed: unknown = JSON.parse(stored);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed as ResultsStore;
            }
        }
    } catch {
        // Dado corrompido ou localStorage indisponível: começa vazio.
    }
    return {};
}

function writeStore(store: ResultsStore): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
        // Sem espaço ou sem permissão: os resultados valem só nesta sessão.
    }
}

function sameQuestions(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function loadRoomResults(roomId: string): RoomResults | null {
    return readStore()[roomId] ?? null;
}

/** Resultados de todas as salas, indexados pelo id da sala. */
export function loadAllRoomResults(): Record<string, RoomResults> {
    return readStore();
}

/**
 * Devolve os jogadores simulados da sala, criando-os na primeira entrada.
 * Se o professor mudou as perguntas da sala, os resultados antigos deixam
 * de ser comparáveis e são recomeçados.
 */
export function getOrCreateSimulatedPlayers(
    roomId: string,
    questionIds: string[],
    timePerQuestion: number,
): OpponentPlayer[] {
    const store = readStore();
    const existing = store[roomId];

    if (existing && sameQuestions(existing.questionIds, questionIds)) {
        return existing.simulatedPlayers;
    }

    const simulatedPlayers = simulatePlayers(questionIds.length, timePerQuestion);
    store[roomId] = { questionIds, simulatedPlayers, players: [] };
    writeStore(store);
    return simulatedPlayers;
}

/** Registra o resultado do aluno; se o mesmo apelido jogar de novo, vale o último. */
export function savePlayerResult(roomId: string, result: PlayerResult): void {
    const store = readStore();
    const roomResults = store[roomId];
    if (!roomResults) return;

    roomResults.players = [
        ...roomResults.players.filter((player) => player.nickname !== result.nickname),
        result,
    ];
    writeStore(store);
}

export function deleteRoomResults(roomId: string): void {
    const store = readStore();
    delete store[roomId];
    writeStore(store);
}
