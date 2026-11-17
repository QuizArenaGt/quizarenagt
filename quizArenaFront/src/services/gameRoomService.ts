/*
 * SERVICE TEMPORÁRIO — salas de jogo (modo demonstração).
 *
 * O backend ainda não possui salas. Este serviço simula a entrada em uma
 * sala para permitir testar a experiência do aluno:
 *  - são aceitos o código DEMO_ROOM_PIN (123456) e os códigos das salas
 *    criadas no painel do professor (salvas no mesmo navegador), desde que
 *    a sala não esteja encerrada;
 *  - salas do professor usam as perguntas escolhidas na criação; a sala
 *    123456 usa todas as perguntas ATIVAS do banco (ou as de exemplo, se
 *    não houver nenhuma válida);
 *  - os outros participantes são jogadores simulados, para que o ranking
 *    e o pódio possam ser testados com um único aluno real.
 *
 * Quando o backend oferecer salas, `joinRoom` deve passar a chamar a API
 * (ex.: POST /rooms/:pin/join) mantendo a mesma assinatura.
 */
import { DEMO_ROOM_PIN, type GameRoom } from '../models/game';
import { isPlayable, type Question } from '../models/question';
import { isRoomOpen } from '../models/room';
import { findRoomByCode } from './roomStorageService';
import { QUESTION_SEEDS } from './mock/questionSeeds';
import { simulatePlayers } from './mock/simulatedPlayers';
import { getOrCreateSimulatedPlayers } from './roomResultsService';
import { loadQuestions } from './questionStorageService';

const DEMO_TIME_PER_QUESTION = 20;
/** Atraso artificial para simular a ida ao servidor. */
const SIMULATED_LATENCY_MS = 400;

export class RoomNotFoundError extends Error {
    constructor() {
        super('Sala não encontrada. Confira o código com o professor.');
        this.name = 'RoomNotFoundError';
    }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RoomClosedError extends Error {
    constructor() {
        super('Esta sala já foi encerrada pelo professor.');
        this.name = 'RoomClosedError';
    }
}

export class EmptyRoomError extends Error {
    constructor() {
        super('Esta sala ainda não tem perguntas disponíveis. Avise o professor.');
        this.name = 'EmptyRoomError';
    }
}

export async function joinRoom(pin: string): Promise<GameRoom> {
    await wait(SIMULATED_LATENCY_MS);

    const allQuestions = loadQuestions();
    const activeQuestions = allQuestions.filter((question) => question.isActive && isPlayable(question));

    // Sala de demonstração 123456: todas as perguntas ativas e jogadores
    // simulados novos a cada entrada (não gera relatório).
    if (pin === DEMO_ROOM_PIN) {
        const questions =
            activeQuestions.length > 0 ? activeQuestions : QUESTION_SEEDS.filter((question) => question.isActive);
        return {
            pin,
            roomId: null,
            title: 'Sala de demonstração',
            timePerQuestion: DEMO_TIME_PER_QUESTION,
            questions,
            opponents: simulatePlayers(questions.length, DEMO_TIME_PER_QUESTION),
            isDemo: true,
        };
    }

    // Sala criada pelo professor
    const room = findRoomByCode(pin);
    if (!room) throw new RoomNotFoundError();
    if (!isRoomOpen(room)) throw new RoomClosedError();

    // Somente as perguntas escolhidas, na ordem da seleção. Perguntas
    // excluídas ou sem resposta válida são ignoradas. Salas antigas, sem
    // lista própria, usam todas as perguntas ativas.
    const questions =
        room.questionIds.length > 0
            ? room.questionIds
                  .map((id) => allQuestions.find((question) => question.id === id))
                  .filter((question): question is Question => question !== undefined && isPlayable(question))
            : activeQuestions;
    if (questions.length === 0) throw new EmptyRoomError();

    return {
        pin,
        roomId: room.id,
        title: room.name,
        timePerQuestion: room.timeLimit,
        questions,
        // Turma simulada fixa por sala: todos os alunos e o relatório do
        // professor veem os mesmos participantes.
        opponents: getOrCreateSimulatedPlayers(
            room.id,
            questions.map((question) => question.id),
            room.timeLimit,
        ),
        // A partida ainda é simulada no navegador (sem backend em tempo real).
        isDemo: true,
    };
}
