import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canPlayAgain, mapBackendRoomStatus } from '../src/models/room.ts';
import { formatGameStatusLabel } from '../src/models/roomReport.ts';

describe('Cancelamento automático por insuficiência de jogadores (Frontend)', () => {
    it('1. mapBackendRoomStatus, formatGameStatusLabel e canPlayAgain tratam CANCELLED corretamente', () => {
        assert.equal(mapBackendRoomStatus('CANCELLED'), 'Finalizado');
        assert.equal(formatGameStatusLabel('CANCELLED'), 'Cancelada');
        assert.equal(
            canPlayAgain({
                id: 'room-1',
                name: 'Sala 1',
                theme: 'Tema',
                timeLimit: 30,
                maxPlayers: 10,
                gameMode: 'CLASSIC',
                status: 'Finalizado',
                backendStatus: 'CANCELLED',
                code: 'ABC123',
                questionIds: [],
                players: [],
            }),
            true,
        );
    });

    it('2. Host e Jogador diferenciam CANCELLED de FINISHED sem declarar vencedor automático nem renderizar Pódio', () => {
        const socketTypesSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/services/socket.ts'),
            'utf8',
        );
        const hostVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/useRoomsViewModel.ts'),
            'utf8',
        );
        const dashboardSource = readFileSync(
            path.resolve(
                import.meta.dirname,
                '../src/features/Dashboard/components/DashboardForm.tsx',
            ),
            'utf8',
        );
        const playVmSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );
        const resultStepSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/steps/ResultStep.tsx'),
            'utf8',
        );
        const playViewSource = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/PlayView.tsx'),
            'utf8',
        );

        assert.match(socketTypesSource, /status\?:\s*BackendRoomStatus;/);
        assert.match(socketTypesSource, /reason\?:\s*string;/);

        assert.match(hostVmSource, /payload\.status === 'CANCELLED' \? 'CANCELLED' : 'FINISHED'/);
        assert.match(dashboardSource, /activeRoom\.backendStatus === 'CANCELLED'/);
        assert.match(dashboardSource, /Partida Cancelada/);
        assert.match(dashboardSource, /Não houve vencedor automático/);

        assert.match(playVmSource, /setIsGameCancelled\(cg\.status === 'CANCELLED'\)/);
        assert.match(playVmSource, /setIsGameCancelled\(payload\?\.status === 'CANCELLED'\)/);
        assert.match(playViewSource, /isGameCancelled=\{viewModel\.isGameCancelled\}/);

        assert.match(resultStepSource, /isGameCancelled\?:\s*boolean/);
        assert.match(resultStepSource, /Partida cancelada, \$\{nickname\}/);
        assert.match(resultStepSource, /!isGameCancelled && playerPosition !== null/);
        assert.match(resultStepSource, /\{!isGameCancelled && \(/);
    });
});
