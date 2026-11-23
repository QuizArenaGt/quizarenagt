import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomReport } from '../src/models/roomReport.ts';
import {
    validateCreateRoomFields,
    extractRoomFieldErrors,
    executeSubmitRoom,
    MIN_ROOM_PLAYERS,
} from '../src/models/room.ts';
import {
    recordRoundClosedResult,
    loadRoomResults,
    clearAllRoomResults,
} from '../src/services/roomResultsService.ts';
import {
    validateLoginFields,
    validateRegisterFields,
    validateRecoverPasswordFields,
} from '../src/features/auth/validation.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Refinamento UI/UX e correções funcionais', () => {
    it('1. Relatórios preservam enunciado histórico mesmo após editar ou remover pergunta do banco', () => {
        clearAllRoomResults();
        const roomId = 'room-snap-1';

        recordRoundClosedResult(roomId, {
            round: {
                id: 'round-1',
                roundNumber: 1,
                status: 'CLOSED',
                openedAt: '2026-11-23T12:00:00.000Z',
                closedAt: '2026-11-23T12:00:20.000Z',
                question: {
                    id: 'snapshot-q-1',
                    statement: 'Enunciado original congelado no snapshot da partida?',
                    options: [
                        { id: 'opt-1', text: 'Correta', isCorrect: true },
                        { id: 'opt-2', text: 'Incorreta', isCorrect: false },
                    ],
                },
                answers: [
                    {
                        id: 'ans-1',
                        player: { id: 'p1', nickname: 'Alice' },
                        option: { id: 'opt-1', text: 'Correta' },
                        isCorrect: true,
                        points: 120,
                        answeredAt: '2026-11-23T12:00:05.000Z',
                    },
                ],
                unansweredPlayers: [],
                ranking: [{ id: 'p1', nickname: 'Alice', score: 120 }],
            },
        });

        const stored = loadRoomResults(roomId);
        assert.ok(stored);
        assert.equal(
            stored.questionStatements?.['snapshot-q-1'],
            'Enunciado original congelado no snapshot da partida?',
        );

        // Mesmo sem a pergunta no banco atual (ou com outro texto editado no banco), o relatório preserva o snapshot
        const reportEmptyBank = buildRoomReport(stored, []);
        assert.ok(reportEmptyBank);
        assert.equal(
            reportEmptyBank.questionRows[0].statement,
            'Enunciado original congelado no snapshot da partida?',
        );
        assert.doesNotMatch(reportEmptyBank.questionRows[0].statement, /Pergunta removida do banco/);

        // Quando não há snapshot nem pergunta no banco, usa fallback neutro e claro
        const reportMissing = buildRoomReport(
            {
                questionIds: ['missing-q'],
                simulatedPlayers: [],
                players: [
                    {
                        nickname: 'Bob',
                        isSimulated: false,
                        answers: [{ questionId: 'missing-q', isCorrect: false, points: 0 }],
                    },
                ],
            },
            [],
        );
        assert.ok(reportMissing);
        assert.equal(
            reportMissing.questionRows[0].statement,
            'Enunciado indisponível para esta partida',
        );
        clearAllRoomResults();
    });

    it('2. Sidebar e cabeçalhos de card permitem quebra do badge de status sem overflow lateral', () => {
        const shellCss = readFrontFile('src/components/layout/DashboardShell/DashboardShell.css');
        const dashCss = readFrontFile('src/features/Dashboard/components/DashboardForm.css');

        assert.match(
            shellCss,
            /\.sidebar-active-room\s*\{[\s\S]*max-width:\s*calc\(100%\s*-\s*2\s*\*\s*var\(--space-3\)\)/,
        );
        assert.match(shellCss, /\.sidebar-active-room__meta\s*\{[\s\S]*flex-wrap:\s*wrap/);
        assert.match(shellCss, /\.sidebar-active-room\s+\.ui-badge\s*\{[\s\S]*max-width:\s*100%/);
        assert.match(dashCss, /\.room-detail-card__head--split\s*\{[\s\S]*flex-wrap:\s*wrap/);
    });

    it('3. Enunciado do gameplay usa tokens de espaçamento válidos sem --space-7 indefinido', () => {
        const playCss = readFrontFile('src/views/Play/PlayView.css');

        assert.doesNotMatch(playCss, /--space-7/);
        assert.match(
            playCss,
            /\.play-question__statement-card\s*\{[\s\S]*padding:\s*var\(--space-8\)\s+var\(--space-8\)/,
        );
        assert.match(
            playCss,
            /@media\s*\(max-width:\s*639px\)[\s\S]*\.play-question__statement-card\s*\{[\s\S]*padding:\s*var\(--space-6\)\s+var\(--space-5\)/,
        );
    });

    it('4. Overview e Card de Participantes apresentam ativos, mínimo (2) e máximo com clareza', () => {
        const statusBar = readFrontFile('src/features/Dashboard/components/RoomOverviewStatusBar.tsx');
        const playersCard = readFrontFile('src/features/Dashboard/components/RoomPlayersCard.tsx');

        assert.equal(MIN_ROOM_PLAYERS, 2);
        assert.match(statusBar, /MIN_ROOM_PLAYERS/);
        assert.match(statusBar, /Jogadores na sala/);
        assert.match(statusBar, /mín\.\s*\$\{MIN_ROOM_PLAYERS\}\s*·\s*máx\.\s*\$\{room\.maxPlayers\}/);
        assert.match(playersCard, /Na sala agora/);
        assert.match(playersCard, /Mínimo p\/ iniciar/);
        assert.match(playersCard, /Limite máximo/);
        assert.match(playersCard, /room-players-capacity__track/);
    });

    it('5. Validações customizadas em Auth e Salas cobrem erros por campo sem validação nativa do navegador', async () => {
        // Regras puras de Auth
        const loginErrors = validateLoginFields({ email: 'invalido', password: '' });
        assert.ok(loginErrors.email);
        assert.ok(loginErrors.password);

        const regErrors = validateRegisterFields({
            name: 'A',
            email: '',
            password: '123',
            confirmPassword: '456',
        });
        assert.ok(regErrors.name);
        assert.ok(regErrors.email);
        assert.ok(regErrors.password);
        assert.equal(regErrors.confirmPassword, 'As senhas não coincidem.');

        const regValid = validateRegisterFields({
            name: 'Professora Ana',
            email: 'ana@escola.com',
            password: 'Password123!',
            confirmPassword: 'Password123!',
        });
        assert.deepEqual(regValid, {});

        const recInvalid = validateRecoverPasswordFields({ email: 'sem-arroba' });
        assert.ok(recInvalid.email);

        // Regras puras de Sala
        const roomFieldErrors = validateCreateRoomFields({
            name: '   ',
            theme: '',
            maxPlayers: 1,
            timeLimit: 999,
            gameMode: 'INVALID' as 'CLASSIC',
        });
        assert.ok(roomFieldErrors.name);
        assert.ok(roomFieldErrors.theme);
        assert.ok(roomFieldErrors.maxPlayers);
        assert.ok(roomFieldErrors.timeLimit);
        assert.ok(roomFieldErrors.gameMode);

        // NaN (campo numérico limpo) produz erro inline amigável
        const roomNaNErrors = validateCreateRoomFields({
            name: 'Sala Teste',
            theme: 'História',
            maxPlayers: Number.NaN,
            timeLimit: 20,
            gameMode: 'CLASSIC',
        });
        assert.ok(roomNaNErrors.maxPlayers);

        // Extração de erros 400 da API por campo
        const apiFieldErrors = extractRoomFieldErrors({
            status: 400,
            errors: { name: 'Nome já utilizado.', maxPlayers: 'Valor fora do intervalo.' },
        });
        assert.equal(apiFieldErrors.name, 'Nome já utilizado.');
        assert.equal(apiFieldErrors.maxPlayers, 'Valor fora do intervalo.');

        // executeSubmitRoom reporta erros por campo sem disparar requisição
        let capturedFields: Record<string, string> = {};
        let requests = 0;
        const ok = await executeSubmitRoom({
            input: {
                name: '',
                theme: '',
                maxPlayers: 55,
                timeLimit: 20,
                gameMode: 'CLASSIC',
            },
            lockRef: { current: false },
            onError: () => undefined,
            onFieldErrors: (errs) => {
                capturedFields = errs as Record<string, string>;
            },
            executeRequest: async () => {
                requests += 1;
                return {};
            },
            onSuccess: () => undefined,
        });
        assert.equal(ok, false);
        assert.equal(requests, 0);
        assert.ok(capturedFields.name);
        assert.ok(capturedFields.theme);
        assert.ok(capturedFields.maxPlayers);

        // Contratos no JSX: noValidate e acessibilidade sem required/minLength/min/max nativos
        const loginForm = readFrontFile('src/features/auth/components/LoginForm/LoginForm.tsx');
        const registerForm = readFrontFile('src/features/auth/components/RegisterForm/RegisterForm.tsx');
        const recoverForm = readFrontFile('src/features/auth/components/RecoverPasswordForm/RecoverPasswordForm.tsx');
        const inputEmail = readFrontFile('src/components/Inputs/InputEmail/InputEmail.tsx');
        const inputPassword = readFrontFile('src/components/Inputs/InputPassword/InputPassword.tsx');
        const dashForm = readFrontFile('src/features/Dashboard/components/DashboardForm.tsx');

        for (const formSrc of [loginForm, registerForm, recoverForm, dashForm]) {
            assert.match(formSrc, /noValidate/);
            assert.doesNotMatch(formSrc, /\srequired[\s/>]/);
        }
        assert.doesNotMatch(inputEmail, /\srequired[\s/>]/);
        assert.doesNotMatch(inputPassword, /\srequired[\s/>]/);
        assert.doesNotMatch(inputPassword, /minLength/);
        assert.match(inputEmail, /aria-invalid=/);
        assert.match(inputEmail, /role="alert"/);
        assert.match(inputPassword, /aria-invalid=/);
        assert.match(inputPassword, /role="alert"/);
        assert.match(dashForm, /aria-invalid=\{Boolean\(roomsVm\.fieldErrors\.name\)\}/);
        assert.match(dashForm, /id="room-max-players-error"/);
    });
});
