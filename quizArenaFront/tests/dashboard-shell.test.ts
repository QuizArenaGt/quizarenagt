import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRoomsByName } from '../src/models/room.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Dashboard Shell & Navegação por Contexto de Sala', () => {
    it('DashboardShell implementa navegação com Icon, estado ativo, atalhos de teclado e drawer mobile', () => {
        const shellSource = readFrontFile('src/components/layout/DashboardShell/DashboardShell.tsx');
        const shellCss = readFrontFile('src/components/layout/DashboardShell/DashboardShell.css');

        assert.match(shellSource, /export type DashboardTabId = 'overview' \| 'rooms';/);
        assert.match(shellSource, /import Icon, \{ type IconName \} from/);
        assert.match(shellSource, /import Logo from/);
        assert.match(shellSource, /import Badge, \{ type BadgeVariant \} from/);
        assert.match(shellSource, /aria-current=\{isActive \? 'page' : undefined\}/);
        assert.match(shellSource, /aria-expanded=\{isMobileNavOpen\}/);
        assert.match(shellSource, /aria-controls="dashboard-sidebar"/);
        assert.match(shellSource, /event\.key === 'Escape'/);
        assert.match(shellSource, /handleNavKeyDown/);
        assert.match(shellSource, /dashboard-drawer-backdrop/);
        assert.match(shellSource, /getInitials\(userDisplayName\)/);

        assert.match(shellCss, /@media \(max-width: 959px\)/);
        assert.match(shellCss, /\.dashboard-sidebar\.is-open\s*\{/);
        assert.match(shellCss, /visibility:\s*hidden;/);
        assert.match(shellCss, /var\(--color-primary-soft\)/);
        assert.match(shellCss, /var\(--focus-ring\)/);
    });

    it('Navegação global possui apenas Visão Geral e Salas, com gerenciamento contextual dentro da sala', () => {
        const dashboardSource = readFrontFile('src/features/Dashboard/components/DashboardForm.tsx');
        const discoverySource = readFrontFile('src/features/Dashboard/components/RoomDiscoveryList.tsx');
        const workspaceSource = readFrontFile('src/features/Dashboard/components/RoomWorkspaceShell.tsx');
        const settingsSource = readFrontFile('src/features/Dashboard/components/RoomSettingsSection.tsx');

        // Sidebar global restrita a Visão Geral e Salas
        assert.match(dashboardSource, /id: 'overview',[\s\S]*label: 'Visão Geral'/);
        assert.match(dashboardSource, /id: 'rooms',[\s\S]*label: 'Salas'/);
        assert.doesNotMatch(dashboardSource, /Banco de Perguntas/);
        assert.doesNotMatch(dashboardSource, /className="context-room-bar"/);
        assert.doesNotMatch(dashboardSource, /📊|🎮|❓/);

        // Listagem de Salas pesquisa por nome (sem código de acesso nem ações concorrentes)
        assert.match(discoverySource, /filterRoomsByName/);
        assert.match(discoverySource, /Pesquisar sala pelo nome/);
        assert.match(discoverySource, /Limpar pesquisa/);
        assert.match(discoverySource, /Gerenciar sala/);
        assert.doesNotMatch(discoverySource, /Abrir por código/);
        assert.doesNotMatch(discoverySource, /Carregar Sala/);
        assert.doesNotMatch(discoverySource, /room-code-chip/);
        assert.doesNotMatch(discoverySource, /formatRoomCode/);
        assert.doesNotMatch(discoverySource, /Encerrar Partida/);
        assert.doesNotMatch(discoverySource, /Jogar novamente/);

        // Workspace interno da sala com breadcrumb de retorno, acesso ao código e 4 seções internas
        assert.match(workspaceSource, /← Voltar para Salas/);
        assert.match(workspaceSource, /formatRoomCode\(room\.code\)/);
        assert.match(workspaceSource, /handleCopyCode/);
        assert.match(workspaceSource, /onShowCode\(room\)/);
        assert.match(workspaceSource, /id: 'overview', label: 'Visão geral'/);
        assert.match(workspaceSource, /id: 'questions', label: 'Perguntas'/);
        assert.match(workspaceSource, /id: 'games', label: 'Partidas'/);
        assert.match(workspaceSource, /id: 'settings', label: 'Configurações'/);
        assert.match(workspaceSource, /handleSubnavKeyDown/);

        // Configurações da sala preservam edição (WAITING), projeção do código e exclusão
        assert.match(settingsSource, /Editar configurações da sala/);
        assert.match(settingsSource, /Excluir sala/);
        assert.match(settingsSource, /Projetar código em tela cheia/);

        // Fluxo contextual dentro de DashboardForm preserva Overview, Perguntas, Partidas e Configurações
        assert.match(dashboardSource, /roomSection === 'overview'/);
        assert.match(dashboardSource, /roomSection === 'questions'/);
        assert.match(dashboardSource, /roomSection === 'games'/);
        assert.match(dashboardSource, /roomSection === 'settings'/);
        assert.match(dashboardSource, /<OverviewStats/);
    });

    it('filterRoomsByName realiza busca parcial, case-insensitive, ignora código e limpa vazio', () => {
        const sampleRooms = [
            { id: '1', name: 'Arena TypeScript', code: 'ABC123' },
            { id: '2', name: 'Desafio React Avançado', code: 'XYZ789' },
            { id: '3', name: 'Banco de Dados SQL', code: 'SQL999' },
        ];

        assert.equal(filterRoomsByName(sampleRooms, '').length, 3);
        assert.equal(filterRoomsByName(sampleRooms, '   ').length, 3);

        // Busca parcial e case-insensitive
        const reactMatches = filterRoomsByName(sampleRooms, '  rEaCt ');
        assert.deepEqual(
            reactMatches.map((room) => room.id),
            ['2'],
        );

        const partialMatches = filterRoomsByName(sampleRooms, 'arEnA');
        assert.deepEqual(
            partialMatches.map((room) => room.id),
            ['1'],
        );

        // Não busca por código da sala
        assert.deepEqual(filterRoomsByName(sampleRooms, 'ABC123'), []);
        assert.deepEqual(filterRoomsByName(sampleRooms, 'XYZ'), []);
        assert.deepEqual(filterRoomsByName(sampleRooms, 'Inexistente'), []);
    });
});
