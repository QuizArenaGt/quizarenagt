import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Visão Geral da Sala (Host Workspace)', () => {
    it('RoomOverviewStatusBar cobre WAITING, IN_PROGRESS, FINISHED e CANCELLED com leitura contextual', () => {
        const source = readFrontFile('src/features/Dashboard/components/RoomOverviewStatusBar.tsx');

        assert.match(source, /Pronta para iniciar/);
        assert.match(source, /Aguardando requisitos/);
        assert.match(source, /Rodada em andamento/);
        assert.match(source, /Entre rodadas/);
        assert.match(source, /Partida finalizada/);
        assert.match(source, /Partida cancelada/);
        assert.match(source, /<Badge variant=\{badgeVariant\}>\{badgeLabel\}<\/Badge>/);
    });

    it('RoomPlayersCard adapta título, estado vazio, avatar no lobby, ranking no placar e badge Respondeu', () => {
        const source = readFrontFile('src/features/Dashboard/components/RoomPlayersCard.tsx');

        assert.match(source, /Lobby de Jogadores/);
        assert.match(source, /Placar ao Vivo/);
        assert.match(source, /Classificação Final/);
        assert.match(source, /Nenhum participante conectado ainda/);
        assert.match(source, /getInitials\(player\.nickname\)/);
        assert.match(source, /Respondeu/);
        assert.match(source, /Saiu/);
        assert.match(source, /Abandonou/);
    });

    it('DashboardForm integra RoomOverviewStatusBar, checklist visual, condução de rodadas e estados finalizados sem emojis', () => {
        const source = readFrontFile('src/features/Dashboard/components/DashboardForm.tsx');

        assert.match(source, /<RoomOverviewStatusBar/);
        assert.match(source, /<RoomPlayersCard/);
        assert.match(source, /className="room-checklist"/);
        assert.match(source, /Adicionar perguntas/);
        assert.match(source, /className="room-progress-track"/);
        assert.match(source, /className="room-control-danger-footer"/);
        assert.match(source, /Ver Relatório Completo da Partida/);
        assert.match(source, /Jogar novamente/);
        assert.doesNotMatch(source, /🚀|🏁|🔄|⏱|▶/);
    });
});
