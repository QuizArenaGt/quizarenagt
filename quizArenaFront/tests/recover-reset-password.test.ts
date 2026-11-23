import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    AUTH_PASSWORD_MAX_BYTES,
    AUTH_PASSWORD_MIN_LENGTH,
    formatAuthApiError,
    validateChangePasswordFields,
    validateRecoverPasswordFields,
    validateResetPasswordFields,
} from '../src/features/auth/validation.ts';
import {
    changePassword,
    recoverPassword,
    resetPassword,
} from '../src/features/auth/services/authService.ts';
import { PLATFORM_FEATURES } from '../src/models/landingContent.ts';
import { ApiError } from '../src/services/api.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Recuperação e redefinição de senha (Frontend)', () => {
    it('1. validateRecoverPasswordFields e validateResetPasswordFields validam formato, tamanho mínimo, limite de 72 bytes e divergência de senhas', () => {
        assert.deepEqual(validateRecoverPasswordFields({ email: '' }), {
            email: 'Informe seu e-mail.',
        });
        assert.deepEqual(validateRecoverPasswordFields({ email: 'invalido' }), {
            email: 'Informe um e-mail válido (ex.: nome@dominio.com).',
        });
        assert.deepEqual(validateRecoverPasswordFields({ email: 'ana@quiz.com' }), {});

        assert.deepEqual(
            validateResetPasswordFields({ newPassword: '', confirmPassword: '' }),
            {
                newPassword: 'Informe uma nova senha.',
                confirmPassword: 'Confirme sua nova senha.',
            },
        );

        assert.deepEqual(
            validateResetPasswordFields({
                newPassword: '123',
                confirmPassword: '123',
            }),
            {
                newPassword: `A senha deve possuir pelo menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`,
            },
        );

        assert.deepEqual(
            validateResetPasswordFields({
                newPassword: 'SenhaValida123',
                confirmPassword: 'OutraSenha123',
            }),
            {
                confirmPassword: 'As senhas não coincidem.',
            },
        );

        const over72Bytes = '🔐'.repeat(19); // 76 bytes UTF-8
        const overResult = validateResetPasswordFields({
            newPassword: over72Bytes,
            confirmPassword: over72Bytes,
        });
        assert.match(overResult.newPassword ?? '', new RegExp(String(AUTH_PASSWORD_MAX_BYTES)));

        assert.deepEqual(
            validateResetPasswordFields({
                newPassword: 'SenhaSegura123',
                confirmPassword: 'SenhaSegura123',
            }),
            {},
        );
    });

    it('2. recoverPassword e resetPassword enviam requisições via apiRequest e propagam sucesso e erro do servidor', async () => {
        const originalFetch = globalThis.fetch;
        const calls: Array<{ url: string; method?: string; body?: string }> = [];

        try {
            globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input.toString();
                calls.push({
                    url,
                    method: init?.method,
                    body: typeof init?.body === 'string' ? init.body : undefined,
                });

                if (url.endsWith('/auth/recover-password')) {
                    return new Response(
                        JSON.stringify({
                            message:
                                'Se o e-mail estiver cadastrado, você receberá instruções para recuperar sua senha.',
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } },
                    );
                }

                const parsed = JSON.parse(String(init?.body ?? '{}')) as { token?: string };
                if (parsed.token === 'expired-token') {
                    return new Response(
                        JSON.stringify({ message: 'Token inválido ou expirado.' }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } },
                    );
                }

                return new Response(
                    JSON.stringify({ message: 'Senha redefinida com sucesso!' }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }) as typeof fetch;

            const recRes = await recoverPassword({ email: 'prof@quiz.dev' });
            assert.match(recRes.message, /se o e-mail estiver cadastrado/i);
            assert.ok(calls[0]?.url.endsWith('/auth/recover-password'));
            assert.equal(calls[0]?.method, 'POST');

            await assert.rejects(
                () =>
                    resetPassword({
                        token: 'expired-token',
                        newPassword: 'NovaSenha123',
                    }),
                (err: unknown) => {
                    assert.ok(err instanceof ApiError);
                    assert.equal(err.status, 400);
                    assert.equal(err.message, 'Token inválido ou expirado.');
                    return true;
                },
            );

            const resetRes = await resetPassword({
                token: 'valid-token-xyz',
                newPassword: 'NovaSenha123',
            });
            assert.equal(resetRes.message, 'Senha redefinida com sucesso!');
            assert.ok(calls[2]?.url.endsWith('/auth/reset-password'));
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('3. formatAuthApiError prioriza mensagem específica de erro 400 e trata falhas 500', () => {
        const err400 = new ApiError('Dados inválidos.', 400, {
            newPassword: 'A senha deve possuir pelo menos 8 caracteres.',
        });
        assert.equal(
            formatAuthApiError(err400, 'Fallback'),
            'A senha deve possuir pelo menos 8 caracteres.',
        );

        const err500 = new ApiError('Erro interno', 500);
        assert.match(formatAuthApiError(err500, 'Fallback'), /servidor/i);
    });

    it('4. ResetPasswordForm utiliza design system atual e App.tsx preserva HomeView e SessionStatusCard', () => {
        const resetSource = readFrontFile(
            'src/features/auth/components/ResetPasswordForm/ResetPasswordForm.tsx',
        );
        assert.match(resetSource, /<AuthBrandPanel/);
        assert.match(resetSource, /<InputPassword/);
        assert.match(resetSource, /<Alert variant="error"/);
        assert.match(resetSource, /<Alert variant="success"/);
        assert.match(resetSource, /<Button/);
        assert.match(resetSource, /<Link to="\/login"/);
        assert.match(resetSource, /Não foi possível identificar o token/);
        assert.match(resetSource, /navigate\('\/recover-password'\)/);

        const appSource = readFrontFile('src/App.tsx');
        assert.match(appSource, /path="\/reset-password"/);
        assert.match(appSource, /<ResetPasswordForm \/>/);
        assert.match(appSource, /<HomeView \/>/);
        assert.match(appSource, /<ProtectedRoute \/>/);
        assert.doesNotMatch(appSource, /HomePage/);
    });

    it('5. validateChangePasswordFields e changePassword cobrem senha atual, nova senha diferente, 72 bytes UTF-8 e Bearer token', async () => {
        assert.deepEqual(
            validateChangePasswordFields({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            }),
            {
                currentPassword: 'Informe sua senha atual.',
                newPassword: 'Informe uma nova senha.',
                confirmPassword: 'Confirme sua nova senha.',
            },
        );

        assert.deepEqual(
            validateChangePasswordFields({
                currentPassword: 'MesmaSenha123',
                newPassword: 'MesmaSenha123',
                confirmPassword: 'MesmaSenha123',
            }),
            {
                newPassword: 'A nova senha deve ser diferente da senha atual.',
            },
        );

        assert.deepEqual(
            validateChangePasswordFields({
                currentPassword: 'SenhaAtual123',
                newPassword: 'NovaSenha456',
                confirmPassword: 'OutraSenha789',
            }),
            {
                confirmPassword: 'As senhas não coincidem.',
            },
        );

        const over72Bytes = '🔐'.repeat(19);
        const overResult = validateChangePasswordFields({
            currentPassword: 'SenhaAtual123',
            newPassword: over72Bytes,
            confirmPassword: over72Bytes,
        });
        assert.match(overResult.newPassword ?? '', new RegExp(String(AUTH_PASSWORD_MAX_BYTES)));

        assert.deepEqual(
            validateChangePasswordFields({
                currentPassword: 'SenhaAtual123',
                newPassword: 'NovaSenha456',
                confirmPassword: 'NovaSenha456',
            }),
            {},
        );

        const originalFetch = globalThis.fetch;
        const originalLocalStorage = globalThis.localStorage;
        let capturedAuthHeader: string | null = null;
        let capturedUrl = '';

        try {
            Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                value: {
                    getItem: (key: string) => (key === 'token' ? 'jwt-atual-123' : null),
                    setItem: () => undefined,
                    removeItem: () => undefined,
                },
            });

            globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
                capturedUrl = typeof input === 'string' ? input : input.toString();
                capturedAuthHeader = new Headers(init?.headers).get('Authorization');

                return new Response(
                    JSON.stringify({
                        message: 'Senha alterada com sucesso!',
                        token: 'jwt-novo-456',
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }) as typeof fetch;

            const result = await changePassword({
                currentPassword: 'SenhaAtual123',
                newPassword: 'NovaSenha456',
            });

            assert.ok(capturedUrl.endsWith('/auth/change-password'));
            assert.equal(capturedAuthHeader, 'Bearer jwt-atual-123');
            assert.equal(result.message, 'Senha alterada com sucesso!');
            assert.equal(result.token, 'jwt-novo-456');
        } finally {
            globalThis.fetch = originalFetch;
            Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                value: originalLocalStorage,
            });
        }
    });

    it('6. Seção de recursos da landing page comunica todos os recursos como disponíveis e ProfileModal expõe alteração de senha', () => {
        assert.equal(PLATFORM_FEATURES.length, 4);
        assert.ok(
            PLATFORM_FEATURES.every((feature) => feature.status === 'available'),
            'Todos os recursos da landing page devem estar disponíveis',
        );

        const landingContentSource = readFrontFile('src/models/landingContent.ts');
        const featuresSectionSource = readFrontFile('src/views/Home/sections/FeaturesSection.tsx');
        assert.doesNotMatch(landingContentSource, /status:\s*'planned'/);
        assert.doesNotMatch(featuresSectionSource, /em desenvolvimento|Em breve/i);

        const profileModalSource = readFrontFile('src/views/Dashboard/ProfileModal/ProfileModal.tsx');
        const profileVmSource = readFrontFile('src/viewmodels/useProfileViewModel.ts');
        assert.match(profileModalSource, /Alterar senha/);
        assert.match(profileModalSource, /id="profile-current-password"/);
        assert.match(profileModalSource, /id="profile-new-password"/);
        assert.match(profileModalSource, /id="profile-confirm-password"/);
        assert.match(profileVmSource, /changePassword/);
        assert.match(profileVmSource, /localStorage\.setItem\('token', response\.token\)/);
        assert.match(profileVmSource, /notifyAuthTokenUpdated\(\)/);

        const socketSource = readFrontFile('src/services/socket.ts');
        assert.match(socketSource, /AUTH_TOKEN_UPDATED_EVENT/);
        assert.match(socketSource, /notifyAuthTokenUpdated/);
        assert.match(socketSource, /isSocketAuthRejectionError/);

        const roomsVmSource = readFrontFile('src/viewmodels/useRoomsViewModel.ts');
        assert.match(roomsVmSource, /AUTH_TOKEN_UPDATED_EVENT/);
        assert.match(roomsVmSource, /isSocketAuthRejectionError/);
        assert.match(roomsVmSource, /socket\.removeAllListeners\(\);\s*\r?\n\s*socket\.disconnect\(\);/);
    });
});
