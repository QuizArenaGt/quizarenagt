import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Release Readiness — Consistência, Acessibilidade e Regressões', () => {
    it('1. App.tsx possui rota fallback * e RegisterForm limpa timeout sem navegar antes do alerta', () => {
        const appSrc = readFrontFile('src/App.tsx');
        const registerSrc = readFrontFile('src/features/auth/components/RegisterForm/RegisterForm.tsx');

        assert.match(appSrc, /path="\*"[\s\S]*Navigate to="\/"/);
        assert.match(registerSrc, /clearTimeout/);
        assert.match(registerSrc, /redirectTimerRef\.current = window\.setTimeout\(\(\) => \{\s*onSuccess\(\);/);
    });

    it('2. LoginModal passa embedded para evitar dois landmarks <main> e Modal padrão substitui modal cru em DashboardForm', () => {
        const loginModalSrc = readFrontFile('src/views/Home/LoginModal/LoginModal.tsx');
        const loginFormSrc = readFrontFile('src/features/auth/components/LoginForm/LoginForm.tsx');
        const dashboardSrc = readFrontFile('src/features/Dashboard/components/DashboardForm.tsx');
        const discoverySrc = readFrontFile('src/features/Dashboard/components/RoomDiscoveryList.tsx');

        assert.match(loginModalSrc, /<LoginForm onSuccess=\{onSuccess\} embedded/);
        assert.match(loginFormSrc, /const ContainerTag = embedded \? 'div' : 'main'/);

        assert.doesNotMatch(dashboardSrc, /className="modal-overlay"/);
        assert.match(dashboardSrc, /isOpen=\{roomsVm\.isCreateOpen\}/);
        assert.doesNotMatch(dashboardSrc, /style=\{\{\s*marginTop:/);

        assert.doesNotMatch(discoverySrc, /<article[^>]*onClick=/);
    });

    it('3. CSS de Dashboard, Home e Perfil utiliza tokens semânticos e suporte a prefers-reduced-motion', () => {
        const dashboardCss = readFrontFile('src/features/Dashboard/components/DashboardForm.css');
        const profileCss = readFrontFile('src/views/Dashboard/ProfileModal/ProfileModal.css');
        const homeCss = readFrontFile('src/views/Home/HomeView.css');
        const profileModalSrc = readFrontFile('src/views/Dashboard/ProfileModal/ProfileModal.tsx');

        assert.doesNotMatch(dashboardCss, /#ddd6fe|#f1f5f9|#fecaca|#b91c1c|#dc2626|#fef2f2|#c4b5fd|#16a34a|#bbf7d0/i);
        assert.doesNotMatch(profileCss, /#f87171|#b91c1c|#fef2f2|#ddd6fe/i);
        assert.doesNotMatch(homeCss, /#ddd6fe|#94a3b8|#f87171|#fecaca|#fef2f2|#b91c1c/i);
        assert.match(homeCss, /prefers-reduced-motion:\s*reduce/);
        assert.match(profileModalSrc, /role="alert"/);
    });
});
