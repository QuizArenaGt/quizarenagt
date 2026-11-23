import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Fundação Visual (UI Foundation)', () => {
    it('tokens.css define tokens semânticos de estado, superfícies, foco e desabilitado', () => {
        const tokens = readFrontFile('src/styles/tokens.css');

        const requiredTokens = [
            '--color-primary-hover',
            '--color-primary-border',
            '--color-danger',
            '--color-danger-hover',
            '--color-danger-soft',
            '--color-danger-border',
            '--color-danger-strong',
            '--color-warning',
            '--color-warning-soft',
            '--color-warning-border',
            '--color-warning-strong',
            '--color-success',
            '--color-success-border',
            '--color-accent-border',
            '--color-surface-subtle',
            '--color-surface-muted',
            '--color-disabled-bg',
            '--color-disabled-text',
            '--opacity-disabled',
            '--shadow-modal',
            '--focus-ring-danger',
        ];

        for (const token of requiredTokens) {
            assert.match(tokens, new RegExp(`${token}:`), `Token ausente: ${token}`);
        }
    });

    it('Icon.tsx contempla todos os ícones essenciais planejados para o QuizArena', () => {
        const iconSource = readFrontFile('src/components/ui/Icon/Icon.tsx');
        const requiredIcons = [
            'dashboard',
            'rooms',
            'questions',
            'users',
            'trophy',
            'chart',
            'play',
            'pause',
            'timer',
            'success',
            'warning',
            'error',
            'info',
            'import',
            'edit',
            'delete',
            'copy',
            'search',
            'settings',
            'logout',
        ];

        for (const name of requiredIcons) {
            assert.match(
                iconSource,
                new RegExp(`\\b${name}:\\s*`),
                `Ícone ausente no catálogo: ${name}`,
            );
        }
    });

    it('Logo.css corrige contraste do destaque na variante dark sem usar clipe de gradiente claro', () => {
        const logoCss = readFrontFile('src/components/ui/Logo/Logo.css');
        assert.match(
            logoCss,
            /\.ui-logo--dark\s+\.ui-logo__highlight\s*\{[\s\S]*?color:\s*var\(--color-highlight\)/,
        );
        assert.doesNotMatch(logoCss, /--gradient-brand-light/);
    });

    it('Componentes UI compartilhados mantêm retrocompatibilidade, acessibilidade e novos primitivos', () => {
        const buttonSource = readFrontFile('src/components/ui/Button/Button.tsx');
        const buttonCss = readFrontFile('src/components/ui/Button/Button.css');
        const badgeSource = readFrontFile('src/components/ui/Badge/Badge.tsx');
        const modalSource = readFrontFile('src/components/ui/Modal/Modal.tsx');
        const alertSource = readFrontFile('src/components/ui/Alert/Alert.tsx');
        const emptySource = readFrontFile('src/components/ui/EmptyState/EmptyState.tsx');
        const skeletonSource = readFrontFile('src/components/ui/Skeleton/Skeleton.tsx');

        assert.match(buttonSource, /isLoading\s*=\s*false/);
        assert.match(buttonSource, /aria-busy=/);
        assert.match(buttonCss, /\.ui-button--sm/);
        assert.match(buttonCss, /\.ui-button:not\(:disabled\):active/);

        assert.match(badgeSource, /FEATURE_STATUS_LABEL/);
        assert.match(badgeSource, /BadgeVariant/);

        assert.match(modalSource, /closeDisabled\s*=\s*false/);

        assert.match(alertSource, /role=\{role\}/);
        assert.match(emptySource, /ui-empty__title/);
        assert.match(skeletonSource, /aria-hidden="true"/);
        assert.match(skeletonSource, /role="status"/);
    });
});
