import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/services/api.ts';
import {
    recordServerTimeSample,
    resetServerClock,
} from '../src/services/serverClock.ts';
import {
    applyProjectionAnswerSubmitted,
    applyProjectionGameCreated,
    applyProjectionGameFinished,
    applyProjectionGameStarted,
    applyProjectionPlayerJoined,
    applyProjectionPlayerLeft,
    applyProjectionRoomArchived,
    applyProjectionRoomUpdated,
    applyProjectionRoundClosed,
    applyProjectionRoundStarted,
    buildProjectionRoute,
    deriveProjectionPhase,
    executeLoadProjectionRoom,
    mapLobbyToProjectionState,
} from '../src/models/projection.ts';
import { getQuestionOptionTone } from '../src/models/question.ts';
import { computeRemainingSecondsFromDeadline } from '../src/models/room.ts';
import type { ApiRoomLobby } from '../src/services/roomStorageService.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

function makeLobbyFixture(overrides: Partial<ApiRoomLobby> = {}): ApiRoomLobby {
    return {
        id: 'room-proj-1',
        code: 'ABC123',
        name: 'Biologia Avançada',
        theme: 'Ciências',
        status: 'WAITING',
        roomStatus: 'ACTIVE',
        gameMode: 'CLASSIC',
        maxPlayers: 20,
        questionTime: 30,
        createdAt: '2026-11-24T12:00:00.000Z',
        host: { id: 'host-1', name: 'Prof. Ada' },
        players: [
            { id: 'gp-1', nickname: 'Alice', avatarId: 'explorer', status: 'ACTIVE', score: 0, joinedAt: '2026-11-24T12:00:01.000Z' },
            { id: 'gp-2', nickname: 'Bob', avatarId: 'fox', status: 'ACTIVE', score: 0, joinedAt: '2026-11-24T12:00:02.000Z' },
        ],
        playerCount: 2,
        currentGame: {
            id: 'game-1',
            status: 'WAITING',
            maxPlayers: 20,
            questionTime: 30,
            gameMode: 'CLASSIC',
            startedAt: null,
            finishedAt: null,
            createdAt: '2026-11-24T12:00:00.000Z',
            totalQuestions: 5,
            players: [
                { id: 'gp-1', nickname: 'Alice', avatarId: 'explorer', status: 'ACTIVE', score: 0, joinedAt: '2026-11-24T12:00:01.000Z' },
                { id: 'gp-2', nickname: 'Bob', avatarId: 'fox', status: 'ACTIVE', score: 0, joinedAt: '2026-11-24T12:00:02.000Z' },
            ],
        },
        ...overrides,
    };
}

describe('Tela de Projeção do Host (/projetar/:code)', () => {
    it('1. carregamento inicial via GET /rooms/:code e tratamento de código inválido e erros HTTP (401, 403, 404, 409)', async () => {
        const lobby = makeLobbyFixture();
        const result = await executeLoadProjectionRoom({
            rawCode: ' abc 123 ',
            fetchLobby: async (cleanCode) => {
                assert.equal(cleanCode, 'ABC123');
                return lobby;
            },
        });

        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.state.roomCode, 'ABC123');
            assert.equal(result.state.roomName, 'Biologia Avançada');
            assert.equal(result.state.totalQuestions, 5);
            assert.equal(deriveProjectionPhase(result.state), 'waiting');
            assert.equal(result.remainingSeconds, 0);
        }

        const invalidRes = await executeLoadProjectionRoom({
            rawCode: '12',
            fetchLobby: async () => lobby,
        });
        assert.deepEqual(invalidRes, {
            ok: false,
            error: { kind: 'invalid_code', message: 'Código da sala inválido para projeção.' },
        });

        for (const [status, expectedKind] of [
            [401, 'auth'],
            [403, 'forbidden'],
            [404, 'not_found'],
            [409, 'archived'],
        ] as const) {
            const errRes = await executeLoadProjectionRoom({
                rawCode: 'ABC123',
                fetchLobby: async () => {
                    throw new ApiError('Erro de teste', status);
                },
            });
            assert.equal(errRes.ok, false);
            if (!errRes.ok) {
                assert.equal(errRes.error.kind, expectedKind);
            }
        }
    });

    it('2. recuperação após F5 restaura rodada OPEN sem expor isCorrect e rodada CLOSED com gabarito e estatísticas agregadas', async () => {
        resetServerClock();
        const serverNowMs = Date.parse('2026-11-24T12:00:12.400Z');
        recordServerTimeSample({
            serverTimeMs: serverNowMs,
            requestStartedPerfMs: 1000,
            requestCompletedPerfMs: 1020,
        });

        const openRoundLobby = makeLobbyFixture({
            status: 'IN_PROGRESS',
            currentGame: {
                id: 'game-1',
                status: 'IN_PROGRESS',
                maxPlayers: 20,
                questionTime: 30,
                gameMode: 'CLASSIC',
                startedAt: '2026-11-24T12:00:00.000Z',
                finishedAt: null,
                createdAt: '2026-11-24T12:00:00.000Z',
                totalQuestions: 5,
                activeRound: {
                    id: 'round-2',
                    roundNumber: 2,
                    status: 'OPEN',
                    openedAt: '2026-11-24T12:00:00.000Z',
                    expiresAt: '2026-11-24T12:00:30.000Z',
                    timeLimit: 30,
                    answeredCount: 1,
                    eligiblePlayerCount: 2,
                    answeredPlayers: [{ id: 'gp-1', nickname: 'Alice', avatarId: 'explorer' }],
                    question: {
                        id: 'q-2',
                        statement: 'Qual organela realiza fotossíntese?',
                        type: 'MULTIPLE_CHOICE',
                        position: 2,
                        options: [
                            { id: 'opt-1', text: 'Mitocôndria', position: 0 },
                            { id: 'opt-2', text: 'Cloroplasto', position: 1 },
                        ],
                    },
                },
                players: makeLobbyFixture().players,
            },
        });

        const openRecovered = await executeLoadProjectionRoom({
            rawCode: 'ABC123',
            fetchLobby: async () => openRoundLobby,
            nowMs: serverNowMs,
        });

        assert.equal(openRecovered.ok, true);
        if (openRecovered.ok) {
            assert.equal(deriveProjectionPhase(openRecovered.state), 'round_open');
            assert.equal(openRecovered.remainingSeconds, 18); // ceil(17.6s)
            assert.deepEqual(openRecovered.state.answeredPlayerIds, ['gp-1']);
            assert.equal(
                openRecovered.state.activeRound?.question.options.some((o) => 'isCorrect' in o),
                false,
            );
        }

        const closedRoundLobby = makeLobbyFixture({
            status: 'IN_PROGRESS',
            currentGame: {
                id: 'game-1',
                status: 'IN_PROGRESS',
                maxPlayers: 20,
                questionTime: 30,
                gameMode: 'CLASSIC',
                startedAt: '2026-11-24T12:00:00.000Z',
                finishedAt: null,
                createdAt: '2026-11-24T12:00:00.000Z',
                totalQuestions: 5,
                lastClosedRound: {
                    id: 'round-2',
                    roundNumber: 2,
                    status: 'CLOSED',
                    openedAt: '2026-11-24T12:00:00.000Z',
                    expiresAt: '2026-11-24T12:00:30.000Z',
                    closedAt: '2026-11-24T12:00:25.000Z',
                    question: {
                        id: 'q-2',
                        statement: 'Qual organela realiza fotossíntese?',
                        options: [
                            { id: 'opt-1', text: 'Mitocôndria', isCorrect: false },
                            { id: 'opt-2', text: 'Cloroplasto', isCorrect: true },
                        ],
                    },
                    answers: [
                        {
                            id: 'ans-1',
                            player: { id: 'gp-1', nickname: 'Alice' },
                            option: { id: 'opt-2', text: 'Cloroplasto' },
                            isCorrect: true,
                            points: 180,
                            answeredAt: '2026-11-24T12:00:06.000Z',
                        },
                    ],
                    unansweredPlayers: [{ id: 'gp-2', nickname: 'Bob' }],
                    ranking: [
                        { id: 'gp-1', nickname: 'Alice', score: 180 },
                        { id: 'gp-2', nickname: 'Bob', score: 0 },
                    ],
                },
            },
        });

        const closedState = mapLobbyToProjectionState(closedRoundLobby);
        assert.equal(deriveProjectionPhase(closedState), 'round_closed');
        assert.equal(closedState.closedRound?.correctCount, 1);
        assert.equal(closedState.closedRound?.wrongCount, 0);
        assert.equal(closedState.closedRound?.unansweredCount, 1);
        assert.equal(closedState.closedRound?.question.options[1]?.isCorrect, true);
        // Modelo da projeção não expõe escolhas individuais de jogadores
        assert.equal('answers' in (closedState.closedRound ?? {}), false);
    });

    it('3. atualiza estado completo via eventos Socket.IO e protege contra isCorrect antecipado', () => {
        let state = mapLobbyToProjectionState(makeLobbyFixture());
        assert.equal(deriveProjectionPhase(state), 'waiting');

        state = applyProjectionPlayerJoined(state, {
            roomId: 'room-proj-1',
            player: { id: 'gp-3', nickname: 'Carol', status: 'ACTIVE', score: 0, joinedAt: '2026-11-24T12:00:03.000Z' },
        });
        assert.equal(state.players.length, 3);

        state = applyProjectionRoomUpdated(state, {
            roomId: 'room-proj-1',
            maxPlayers: 15,
            questionTime: 25,
            gameMode: 'HARDCORE',
        });
        assert.equal(state.gameMode, 'HARDCORE');
        assert.equal(state.timeLimit, 25);

        state = applyProjectionGameStarted(state, {
            roomId: 'room-proj-1',
            status: 'IN_PROGRESS',
        });
        assert.equal(deriveProjectionPhase(state), 'between_rounds');

        // Mesmo se um payload injetasse `isCorrect` na rodada aberta, sanitizeOpenRound remove o campo
        state = applyProjectionRoundStarted(state, {
            finished: false,
            round: {
                id: 'round-1',
                roundNumber: 1,
                status: 'OPEN',
                openedAt: '2026-11-24T12:01:00.000Z',
                expiresAt: '2026-11-24T12:01:25.000Z',
                timeLimit: 25,
                question: {
                    id: 'q-1',
                    statement: 'Pergunta 1',
                    type: 'MULTIPLE_CHOICE',
                    position: 1,
                    options: [
                        { id: 'o-1', text: 'A', position: 0, isCorrect: true } as unknown as { id: string; text: string; position: number },
                        { id: 'o-2', text: 'B', position: 1, isCorrect: false } as unknown as { id: string; text: string; position: number },
                    ],
                },
            },
        });
        assert.equal(deriveProjectionPhase(state), 'round_open');
        assert.equal(
            state.activeRound?.question.options.some((o) => 'isCorrect' in o),
            false,
        );

        state = applyProjectionAnswerSubmitted(state, {
            roundId: 'round-1',
            player: { id: 'gp-1', nickname: 'Alice' },
        });
        state = applyProjectionAnswerSubmitted(state, {
            roundId: 'round-1',
            player: { id: 'gp-1', nickname: 'Alice' },
        });
        state = applyProjectionAnswerSubmitted(state, {
            roundId: 'other-round',
            player: { id: 'gp-2', nickname: 'Bob' },
        });
        assert.deepEqual(state.answeredPlayerIds, ['gp-1']);

        state = applyProjectionPlayerLeft(state, {
            roomId: 'room-proj-1',
            gameId: 'game-1',
            gameStatus: 'IN_PROGRESS',
            player: { id: 'gp-1', nickname: 'Alice', status: 'LEFT', score: 0 },
            eligiblePlayerCount: 2,
        });
        assert.deepEqual(state.answeredPlayerIds, []);

        state = applyProjectionRoundClosed(state, {
            round: {
                id: 'round-1',
                roundNumber: 1,
                status: 'CLOSED',
                openedAt: '2026-11-24T12:01:00.000Z',
                closedAt: '2026-11-24T12:01:15.000Z',
                question: {
                    id: 'q-1',
                    statement: 'Pergunta 1',
                    options: [
                        { id: 'o-1', text: 'A', isCorrect: true },
                        { id: 'o-2', text: 'B', isCorrect: false },
                    ],
                },
                answers: [
                    {
                        id: 'a-2',
                        player: { id: 'gp-2', nickname: 'Bob' },
                        option: { id: 'o-2', text: 'B' },
                        isCorrect: false,
                        points: -30,
                        answeredAt: '2026-11-24T12:01:05.000Z',
                    },
                ],
                unansweredPlayers: [{ id: 'gp-3', nickname: 'Carol' }],
                ranking: [
                    { id: 'gp-3', nickname: 'Carol', score: 0 },
                    { id: 'gp-2', nickname: 'Bob', score: -30 },
                ],
            },
        });
        assert.equal(deriveProjectionPhase(state), 'round_closed');
        assert.equal(state.closedRound?.wrongCount, 1);

        // game:finished sem ranking preserva ranking da última rodada encerrada
        state = applyProjectionGameFinished(state, { roomId: 'room-proj-1' });
        assert.equal(deriveProjectionPhase(state), 'finished');
        assert.equal(state.finalRanking[0]?.nickname, 'Carol');
        assert.equal(state.finalRanking[1]?.score, -30);

        // game:created reinicia para WAITING
        state = applyProjectionGameCreated(state, {
            roomId: 'room-proj-1',
            status: 'WAITING',
            maxPlayers: 20,
            questionTime: 30,
            gameMode: 'CLASSIC',
        });
        assert.equal(deriveProjectionPhase(state), 'waiting');
        assert.equal(state.players.length, 0);

        // room:archived encerra a projeção
        state = applyProjectionRoomArchived(state, { roomId: 'room-proj-1' });
        assert.equal(deriveProjectionPhase(state), 'archived');
    });

    it('4. temporizador sincronizado da projeção reutiliza relógio monotônico sem Date.now() e reage a visibilitychange', () => {
        resetServerClock();
        const openedAt = '2026-11-24T12:00:00.000Z';
        const expiresAt = '2026-11-24T12:00:30.000Z';

        // Sem sincronização: retorna null (exibe --s), sem fallback em Date.now()
        assert.equal(computeRemainingSecondsFromDeadline(expiresAt, openedAt, 30), null);

        const origDateNow = Date.now;
        try {
            const baseServerMs = Date.parse(openedAt);
            Date.now = () => baseServerMs + 3_600_000;

            recordServerTimeSample({
                serverTimeMs: baseServerMs + 10_000,
                requestStartedPerfMs: 2_000,
                requestCompletedPerfMs: 2_020,
            });

            // 10s decorridos => 20s restantes, independente do Date.now() adulterado
            assert.equal(
                computeRemainingSecondsFromDeadline(
                    expiresAt,
                    openedAt,
                    30,
                    baseServerMs + 10_000,
                ),
                20,
            );
        } finally {
            Date.now = origDateNow;
            resetServerClock();
        }

        const projVmSrc = readFrontFile('src/viewmodels/useProjectionViewModel.ts');
        assert.doesNotMatch(projVmSrc, /Date\.now\(/);
        assert.match(projVmSrc, /computeRemainingSecondsFromDeadline/);
        assert.match(projVmSrc, /subscribeServerClock/);
        assert.match(projVmSrc, /syncSocketClock/);
        assert.match(projVmSrc, /visibilitychange/);
    });

    it('5. projeção é estritamente somente leitura, protege rota /projetar/:code, preserva RoomCodeModal e cores das alternativas', () => {
        assert.equal(buildProjectionRoute(' abc123 '), '/projetar/ABC123');
        assert.equal(buildProjectionRoute('inv'), '/dashboard');

        const appSrc = readFrontFile('src/App.tsx');
        const workspaceSrc = readFrontFile('src/features/Dashboard/components/RoomWorkspaceShell.tsx');
        const dashboardCssSrc = readFrontFile('src/features/Dashboard/components/DashboardForm.css');
        const projVmSrc = readFrontFile('src/viewmodels/useProjectionViewModel.ts');
        const projViewSrc = readFrontFile('src/views/Projection/ProjectionView.tsx');
        const projCssSrc = readFrontFile('src/views/Projection/ProjectionView.css');

        // Rota protegida e botões equilibrados de Compartilhar código e Abrir projeção
        assert.match(appSrc, /path="\/projetar\/:code"/);
        assert.match(appSrc, /<ProtectedRoute[\s\S]*ProjectionView/);
        assert.match(workspaceSrc, /onShowCode\(room\)/);
        assert.match(workspaceSrc, /<span>Compartilhar código<\/span>/);
        assert.doesNotMatch(workspaceSrc, /<span>Projetar<\/span>/);
        assert.match(workspaceSrc, /<span>Abrir projeção<\/span>/);
        assert.match(workspaceSrc, /room-access-card__projection-group/);
        assert.match(workspaceSrc, /window\.open\([\s\S]*_blank/);
        assert.match(dashboardCssSrc, /\.room-access-card__projection-group\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
        assert.match(dashboardCssSrc, /@media\s*\(max-width:\s*767px\)[\s\S]*\.room-access-card__projection-group\s*\{[^}]*grid-template-columns:\s*1fr/);

        // Ausência de ações de controle ou acesso ao banco de gabarito na projeção
        for (const forbidden of [
            'startRoomApi',
            'createNextRoundApi',
            'closeRoundApi',
            'finishRoomApi',
            'playAgainApi',
            'archiveRoomApi',
            'listQuestionsApi',
        ]) {
            assert.doesNotMatch(projVmSrc, new RegExp(forbidden));
            assert.doesNotMatch(projViewSrc, new RegExp(forbidden));
        }

        // Fullscreen API, responsividade e cores das 4 alternativas preservadas
        assert.match(projViewSrc, /requestFullscreen/);
        assert.match(projViewSrc, /exitFullscreen/);
        assert.match(projViewSrc, /fullscreenchange/);
        assert.match(projCssSrc, /:fullscreen\s+\.projection__stage/);
        assert.match(projCssSrc, /@media\s*\(max-width:\s*860px\)/);
        assert.match(projCssSrc, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
        assert.match(projCssSrc, /\.projection-option--0\s*\{[^}]*var\(--color-coral\)/);
        assert.match(projCssSrc, /\.projection-option--1\s*\{[^}]*var\(--color-pink\)/);
        assert.match(projCssSrc, /\.projection-option--2\s*\{[^}]*var\(--color-mint\)/);
        assert.match(projCssSrc, /\.projection-option--3\s*\{[^}]*var\(--color-highlight\)/);
    });

    it('6. Verdadeiro ou Falso usa cores semânticas pelo significado (#86EFAC / #FCA5A5) em jogador e projeção, sem afetar múltipla escolha', () => {
        // Múltipla escolha convencional preserva paleta por posição 0..3 mesmo com texto coincidente
        assert.equal(getQuestionOptionTone('MULTIPLE_CHOICE', 'Verdadeiro', 0), '0');
        assert.equal(getQuestionOptionTone('MULTIPLE_CHOICE', 'Falso', 1), '1');
        assert.equal(getQuestionOptionTone('MULTIPLE_CHOICE', 'Opção C', 2), '2');
        assert.equal(getQuestionOptionTone('MULTIPLE_CHOICE', 'Opção D', 3), '3');

        // Verdadeiro ou Falso segue o significado independente da ordem/posição
        const standardOrder = [{ text: 'Verdadeiro' }, { text: 'Falso' }];
        assert.equal(getQuestionOptionTone('TRUE_FALSE', 'Verdadeiro', 0, standardOrder), 'true');
        assert.equal(getQuestionOptionTone('TRUE_FALSE', 'Falso', 1, standardOrder), 'false');

        const invertedOrder = [{ text: '  falso ' }, { text: 'VERDADEIRO' }];
        assert.equal(getQuestionOptionTone('TRUE_FALSE', '  falso ', 0, invertedOrder), 'false');
        assert.equal(getQuestionOptionTone('TRUE_FALSE', 'VERDADEIRO', 1, invertedOrder), 'true');

        // Fallback em closedRound sem `type` após F5 detecta par padrão Verdadeiro/Falso
        assert.equal(getQuestionOptionTone(undefined, 'Falso', 0, standardOrder), 'false');
        assert.equal(getQuestionOptionTone(undefined, 'Verdadeiro', 1, standardOrder), 'true');
        assert.equal(
            getQuestionOptionTone(undefined, 'Sim', 0, [{ text: 'Sim' }, { text: 'Não' }]),
            '0',
        );

        const tokensSrc = readFrontFile('src/styles/tokens.css');
        const playCssSrc = readFrontFile('src/views/Play/PlayView.css');
        const questionStepSrc = readFrontFile('src/views/Play/steps/QuestionStep.tsx');
        const projViewSrc = readFrontFile('src/views/Projection/ProjectionView.tsx');
        const projCssSrc = readFrontFile('src/views/Projection/ProjectionView.css');

        // Tokens semânticos definidos corretamente
        assert.match(tokensSrc, /--color-option-true:\s*var\(--color-mint\);/);
        assert.match(tokensSrc, /--color-option-false:\s*#fca5a5;/i);

        // Ambos os fluxos (jogador e projeção) usam o helper compartilhado getQuestionOptionTone
        assert.match(questionStepSrc, /getQuestionOptionTone\(/);
        assert.match(projViewSrc, /getQuestionOptionTone\(/);

        // Estados preservados para Verdadeiro e Falso em jogador e projeção, sem alterar --0..--3
        assert.match(playCssSrc, /\.play-option--true\s*\{[^}]*var\(--color-option-true\)/);
        assert.match(playCssSrc, /\.play-option--false\s*\{[^}]*var\(--color-option-false\)/);
        assert.match(playCssSrc, /\.play-option--true\.play-option--unselected/);
        assert.match(playCssSrc, /\.play-option--0\s*\{[^}]*var\(--color-coral\)/);
        assert.match(playCssSrc, /\.play-option--1\s*\{[^}]*var\(--color-pink\)/);
        assert.match(playCssSrc, /\.play-option--2\s*\{[^}]*var\(--color-mint\)/);
        assert.match(playCssSrc, /\.play-option--3\s*\{[^}]*var\(--color-highlight\)/);

        assert.match(projCssSrc, /\.projection-option--true\s*\{[^}]*var\(--color-option-true\)/);
        assert.match(projCssSrc, /\.projection-option--false\s*\{[^}]*var\(--color-option-false\)/);
    });

    it('7. resumo da rodada e placar parcial na projeção possuem composição equilibrada e responsiva', () => {
        const projViewSrc = readFrontFile('src/views/Projection/ProjectionView.tsx');
        const projCssSrc = readFrontFile('src/views/Projection/ProjectionView.css');

        // Cabeçalhos uniformes nos dois painéis e classe para bloco único quando sem ranking
        assert.match(projViewSrc, /projection-closed-footer--single/);
        assert.match(projViewSrc, /projection-panel__header[\s\S]*Resumo da rodada/);
        assert.match(projViewSrc, /projection-panel__header[\s\S]*Placar parcial/);

        // Grid simétrico com altura igualada e responsividade completa
        assert.match(
            projCssSrc,
            /\.projection-closed-footer\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*align-items:\s*stretch;/,
        );
        assert.match(projCssSrc, /\.projection-panel\s*\{[^}]*height:\s*100%;/);
        assert.match(
            projCssSrc,
            /@media\s*\(max-width:\s*860px\)[\s\S]*\.projection-closed-footer,\s*\r?\n\s*\.projection-closed-footer--single\s*\{[^}]*grid-template-columns:\s*1fr;/,
        );
        assert.match(projCssSrc, /@media\s*\(max-width:\s*480px\)[\s\S]*\.projection-stats\s*\{[^}]*grid-template-columns:\s*1fr;/);
    });
});
