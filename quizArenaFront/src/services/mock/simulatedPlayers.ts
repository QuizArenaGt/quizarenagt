/*
 * JOGADORES SIMULADOS (mock).
 *
 * Enquanto não há partidas em tempo real, estes participantes completam a
 * turma para que ranking, pódio e relatório do professor possam ser
 * testados com um único aluno real. Cada um tem uma taxa de acerto e uma
 * rapidez diferentes; a pontuação usa a mesma regra do aluno
 * (calculatePoints), então os números são comparáveis.
 */
import { calculatePoints, type OpponentPlayer } from '../../models/game';

const SIMULATED_PROFILES = [
    { nickname: 'Ana', accuracy: 0.85, speed: 0.75 },
    { nickname: 'Léo', accuracy: 0.7, speed: 0.6 },
    { nickname: 'Bia', accuracy: 0.6, speed: 0.8 },
    { nickname: 'Davi', accuracy: 0.5, speed: 0.5 },
    { nickname: 'Malu', accuracy: 0.4, speed: 0.65 },
];

export function simulatePlayers(questionCount: number, timePerQuestion: number): OpponentPlayer[] {
    const timeLimitMs = timePerQuestion * 1000;

    return SIMULATED_PROFILES.map(({ nickname, accuracy, speed }) => ({
        nickname,
        pointsPerQuestion: Array.from({ length: questionCount }, () => {
            const isCorrect = Math.random() < accuracy;
            // Tempo restante ao responder: varia em torno da rapidez do jogador.
            const timeLeftRatio = Math.min(Math.max(speed + (Math.random() - 0.5) * 0.4, 0), 1);
            return calculatePoints(isCorrect, timeLeftRatio * timeLimitMs, timeLimitMs);
        }),
    }));
}
