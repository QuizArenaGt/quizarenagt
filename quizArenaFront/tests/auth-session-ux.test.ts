import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Auth & Session UX', () => {
    it('LoginForm reutiliza Button e Alert e navega via Link para recuperação e cadastro', () => {
        const source = readFrontFile('src/features/auth/components/LoginForm/LoginForm.tsx');

        assert.match(source, /import Alert from/);
        assert.match(source, /import Button from/);
        assert.match(source, /<Alert variant="error">\{error\}<\/Alert>/);
        assert.match(source, /<Button[\s\S]*type="submit"[\s\S]*isLoading=\{isLoading\}/);
        assert.match(source, /<Link to="\/recover-password"/);
        assert.match(source, /<Link to="\/register"/);
        assert.doesNotMatch(source, /<a href="\/recover-password"/);
        assert.doesNotMatch(source, /btn-submit/);
        assert.doesNotMatch(source, /login-error/);
    });

    it('RegisterForm padroniza campos com InputEmail, InputPassword, Alert e Button', () => {
        const source = readFrontFile('src/features/auth/components/RegisterForm/RegisterForm.tsx');

        assert.match(source, /import InputEmail from/);
        assert.match(source, /import InputPassword from/);
        assert.match(source, /import Alert from/);
        assert.match(source, /import Button from/);
        assert.match(source, /id="password"[\s\S]*autoComplete="new-password"/);
        assert.match(source, /id="confirmPassword"[\s\S]*autoComplete="new-password"/);
        assert.match(source, /<Alert variant="error">\{error\}<\/Alert>/);
        assert.match(source, /<Alert variant="success">\{success\}<\/Alert>/);
        assert.match(source, /<Button[\s\S]*type="submit"[\s\S]*isLoading=\{isLoading\}/);
        assert.doesNotMatch(source, /btn-submit/);
        assert.doesNotMatch(source, /register-success/);
    });

    it('RecoverPasswordForm usa AuthBrandPanel, exibe erro real do serviço e navega via Link', () => {
        const source = readFrontFile('src/features/auth/components/RecoverPasswordForm/RecoverPasswordForm.tsx');

        assert.match(source, /<AuthBrandPanel[\s\S]*title="Recuperar senha"[\s\S]*description=/);
        assert.match(source, /error instanceof Error[\s\S]*\? error\.message/);
        assert.match(source, /<Alert variant="error">\{error\}<\/Alert>/);
        assert.match(source, /<Alert variant="success">\{success\}<\/Alert>/);
        assert.match(source, /<Button[\s\S]*type="submit"[\s\S]*isLoading=\{isLoading\}/);
        assert.match(source, /<Link to="\/login"/);
        assert.doesNotMatch(source, /Erro ao fazer login/);
        assert.doesNotMatch(source, /console\.(log|error)/);
        assert.doesNotMatch(source, /<a href="\/login"/);
    });

    it('InputPassword e InputEmail suportam desabilitação, ids customizados e espaço para o botão de olho', () => {
        const passwordSource = readFrontFile('src/components/Inputs/InputPassword/InputPassword.tsx');
        const passwordCss = readFrontFile('src/components/Inputs/InputPassword/InputPassword.css');
        const emailSource = readFrontFile('src/components/Inputs/InputEmail/InputEmail.tsx');
        const emailCss = readFrontFile('src/components/Inputs/InputEmail/InputEmail.css');

        assert.match(passwordSource, /className="input--with-toggle"/);
        assert.match(passwordSource, /disabled=\{disabled\}/);
        assert.match(emailSource, /disabled=\{disabled\}/);
        assert.match(emailCss, /\.input--with-toggle\s*\{[\s\S]*padding-right:\s*48px/);
        assert.match(emailCss, /:disabled\s*\{/);
        assert.match(passwordCss, /width:\s*36px;\s*\r?\n\s*height:\s*36px;/);
    });

    it('ProtectedRoute delega os estados de sessão para SessionStatusCard sem conteúdo HTML cru', () => {
        const appSource = readFrontFile('src/App.tsx');
        const cardSource = readFrontFile('src/components/layout/SessionStatusCard/SessionStatusCard.tsx');

        assert.match(appSource, /<SessionStatusCard status="checking" \/>/);
        assert.match(appSource, /<SessionStatusCard[\s\S]*status="error"[\s\S]*onRetry=\{/);
        assert.doesNotMatch(appSource, /<div>Validando sessão\.\.\.<\/div>/);
        assert.match(cardSource, /<Logo/);
        assert.match(cardSource, /<LoadingState label="Validando sua sessão…"/);
        assert.match(cardSource, /<Alert[\s\S]*variant="error"/);
        assert.match(cardSource, /<Button[\s\S]*onClick=\{onRetry\}/);
        assert.match(cardSource, /<Button[\s\S]*to="\/login"/);
    });

    it('ResetPasswordForm usa AuthBrandPanel, InputPassword, Alert, Button e Link para /login', () => {
        const resetSource = readFrontFile(
            'src/features/auth/components/ResetPasswordForm/ResetPasswordForm.tsx',
        );

        assert.match(resetSource, /import InputPassword from/);
        assert.match(resetSource, /import AuthBrandPanel from/);
        assert.match(resetSource, /import Alert from/);
        assert.match(resetSource, /import Button from/);
        assert.match(resetSource, /<AuthBrandPanel[\s\S]*title="Nova senha"/);
        assert.match(resetSource, /id="newPassword"[\s\S]*autoComplete="new-password"/);
        assert.match(resetSource, /id="confirmPassword"[\s\S]*autoComplete="new-password"/);
        assert.match(resetSource, /<Link to="\/login"/);
        assert.doesNotMatch(resetSource, /btn-submit/);
    });
});
