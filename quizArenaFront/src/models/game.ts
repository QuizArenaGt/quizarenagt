/*
 * MODEL — partida (visão do aluno).
 *
 * O backend ainda não possui salas nem partidas. Estes tipos descrevem o
 * que o frontend precisa e servem de proposta de contrato para a equipe
 * de backend.
 */
import type { Question } from './question';

/** Código da sala de demonstração, usado enquanto não há salas reais. */
export const DEMO_ROOM_PIN = '123456';
export const PIN_LENGTH = 6;
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;

/**
 * Outro participante da sala. Na demonstração, são jogadores simulados
 * com a pontuação de cada pergunta já definida; com o backend, esses
 * dados virão do servidor a cada rodada.
 */
export interface OpponentPlayer {
    nickname: string;
    /** Pontos obtidos em cada pergunta, na ordem da partida. */
    pointsPerQuestion: number[];
}

export interface GameRoom {
    pin: string;
    /** Id da sala do professor; null na sala de demonstração (sem relatório). */
    roomId: string | null;
    title: string;
    /** Tempo para responder cada pergunta, em segundos. */
    timePerQuestion: number;
    questions: Question[];
    opponents: OpponentPlayer[];
    /** Indica que a sala é simulada no frontend. */
    isDemo: boolean;
}

/** Linha do ranking. */
export interface RankingEntry {
    position: number;
    nickname: string;
    score: number;
    isCurrentPlayer: boolean;
}

/**
 * Monta o ranking após `answeredCount` perguntas: soma os pontos de cada
 * participante até ali e ordena do maior para o menor. Em caso de empate,
 * o aluno atual aparece antes (critério simples e estável para a demo).
 */
export function buildRanking(
    player: { nickname: string; score: number },
    opponents: OpponentPlayer[],
    answeredCount: number,
): RankingEntry[] {
    const entries = [
        { nickname: player.nickname, score: player.score, isCurrentPlayer: true },
        ...opponents.map((opponent) => ({
            nickname: opponent.nickname,
            score: opponent.pointsPerQuestion
                .slice(0, answeredCount)
                .reduce((sum, points) => sum + points, 0),
            isCurrentPlayer: false,
        })),
    ];

    return entries
        .sort((a, b) => b.score - a.score || Number(b.isCurrentPlayer) - Number(a.isCurrentPlayer))
        .map((entry, index) => ({ ...entry, position: index + 1 }));
}

/** Resposta registrada pelo aluno em uma pergunta. */
export interface PlayerAnswer {
    questionId: string;
    /** null quando o tempo acabou sem resposta. */
    selectedOptionId: string | null;
    isCorrect: boolean;
    points: number;
}

/**
 * Etapas da experiência do aluno:
 * código → apelido → sala de espera → pergunta → resultado da pergunta
 * → (próxima pergunta...) → resultado final.
 */
export type PlayPhase = 'join' | 'nickname' | 'lobby' | 'question' | 'feedback' | 'finished';

const MIN_POINTS = 500;
const SPEED_BONUS = 500;

/**
 * Regra de pontuação: acerto vale de 500 a 1000 pontos, conforme a
 * rapidez da resposta. Erro ou tempo esgotado vale 0.
 */
export function calculatePoints(isCorrect: boolean, timeLeftMs: number, timeLimitMs: number): number {
    if (!isCorrect || timeLimitMs <= 0) return 0;
    const speedRatio = Math.min(Math.max(timeLeftMs / timeLimitMs, 0), 1);
    return Math.round(MIN_POINTS + SPEED_BONUS * speedRatio);
}

/** Mantém apenas dígitos e limita ao tamanho do código. */
export function sanitizePin(value: string): string {
    return value.replace(/\D/g, '').slice(0, PIN_LENGTH);
}
