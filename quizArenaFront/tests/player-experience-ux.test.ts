import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePoints } from '../src/models/game.ts';

function relativeLuminance(hex: string): number {
    const clean = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((offset) => {
        const channel = parseInt(clean.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.03928
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
    const lumA = relativeLuminance(hexA);
    const lumB = relativeLuminance(hexB);
    return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

describe('Experiência do Jogador — Join, Lobby, Gameplay e Resultados', () => {
    it('1. JoinStep e NicknameStep orientam em 2 passos claros com Alert e contador de caracteres', () => {
        const joinSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/steps/JoinStep.tsx'),
            'utf8',
        );
        const nickSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/steps/NicknameStep.tsx'),
            'utf8',
        );

        assert.match(joinSrc, /Passo 1 de 2/);
        assert.match(joinSrc, /Alert/);
        assert.match(joinSrc, /isLoading=\{isJoining\}/);

        assert.match(nickSrc, /Passo 2 de 2/);
        assert.match(nickSrc, /Sala \{pin\}/);
        assert.match(nickSrc, /NICKNAME_MAX_LENGTH/);
        assert.match(nickSrc, /Alert/);
    });

    it('2. PlayView e usePlayViewModel expõem estado ao vivo e alerta de reconexão', () => {
        const vmSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/viewmodels/usePlayViewModel.ts'),
            'utf8',
        );
        const playViewSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/PlayView.tsx'),
            'utf8',
        );

        assert.match(vmSrc, /PlayerSocketStatus/);
        assert.match(vmSrc, /socket\.on\('disconnect'/);
        assert.match(vmSrc, /socket\.on\('connect_error'/);
        assert.match(playViewSrc, /play__chip--connection/);
        assert.match(playViewSrc, /Reconectando…/);
        assert.match(playViewSrc, /LoadingState/);
    });

    it('3. QuestionStep implementa urgência progressiva no timer e feedback inequívoco de envio e bloqueio', () => {
        const qSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/steps/QuestionStep.tsx'),
            'utf8',
        );

        assert.match(qSrc, /WARN_TIME_SECONDS/);
        assert.match(qSrc, /is-warn/);
        assert.match(qSrc, /is-low/);
        assert.match(qSrc, /is-expired/);
        assert.match(qSrc, /Resposta registrada e bloqueada!/);
        assert.match(qSrc, /não pode ser alterada/);
        assert.match(qSrc, /Nenhuma resposta foi enviada nesta rodada/);
    });

    it('4. FeedbackStep e ResultStep diferenciam erros de não respondidas sem inventar métricas', () => {
        const fbSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/steps/FeedbackStep.tsx'),
            'utf8',
        );
        const resSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/steps/ResultStep.tsx'),
            'utf8',
        );
        const cssSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/PlayView.css'),
            'utf8',
        );

        assert.match(fbSrc, /Sua resposta:/);
        assert.match(fbSrc, /Gabarito:/);
        assert.match(fbSrc, /Placar parcial/);

        assert.match(resSrc, /wrongSubmittedCount/);
        assert.match(resSrc, /unansweredCount/);
        assert.match(resSrc, /Sem resposta/);
        assert.match(resSrc, /play-result__stats/);

        assert.match(cssSrc, /prefers-reduced-motion:\s*reduce/);
        assert.doesNotMatch(cssSrc, /#7c3aed|#e2e8f0|#fdba74|#94a3b8|#f87171/);
    });

    it('5. Alternativa A substitui o roxo de fundo por cor com contraste elevado e preserva estados visuais', () => {
        const tokensSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/styles/tokens.css'),
            'utf8',
        );
        const cssSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/PlayView.css'),
            'utf8',
        );

        const coralMatch = tokensSrc.match(/--color-coral:\s*(#[0-9a-fA-F]{6});/);
        const textMatch = tokensSrc.match(/--color-text:\s*(#[0-9a-fA-F]{6});/);
        const primaryMatch = tokensSrc.match(/--color-primary:\s*(#[0-9a-fA-F]{6});/);
        const secondaryMatch = tokensSrc.match(/--color-secondary:\s*(#[0-9a-fA-F]{6});/);

        assert.ok(coralMatch, '--color-coral deve estar definido em tokens.css');
        assert.ok(textMatch && primaryMatch && secondaryMatch);

        const coralHex = coralMatch[1];
        const textHex = textMatch[1];
        const bgStartHex = primaryMatch[1];
        const bgEndHex = secondaryMatch[1];

        // Garante que a alternativa 0 não reutiliza o roxo do fundo e usa var(--color-coral) + var(--color-text)
        assert.match(
            cssSrc,
            /\.play-option--0\s*\{[^}]*background:\s*var\(--color-coral\);[^}]*color:\s*var\(--color-text\);[^}]*\}/,
        );
        assert.doesNotMatch(
            cssSrc,
            /\.play-option--0\s*\{[^}]*var\(--color-primary\)/,
        );

        // Badge da letra, hover, seleção e não-selecionada preservados
        assert.match(cssSrc, /\.play-option--0\s+\.play-option__letter/);
        assert.match(cssSrc, /\.play-option:hover:not\(:disabled\)/);
        assert.match(cssSrc, /\.play-option--selected\s*\{/);
        assert.match(cssSrc, /\.play-option--unselected\s*\{/);
        assert.match(cssSrc, /\.play-option:focus-visible\s*\{/);

        // Contraste WCAG AA+ para texto (>= 4.5:1) e >= 3:1 contra ambos os tons do gradiente de fundo
        assert.ok(contrastRatio(coralHex, textHex) >= 4.5);
        assert.ok(contrastRatio(coralHex, bgStartHex) >= 3.0);
        assert.ok(contrastRatio(coralHex, bgEndHex) >= 3.0);
    });

    it('6. Alternativa C substitui o azul (#38bdf8) por verde menta (#86EFAC) sem afetar --color-accent', () => {
        const tokensSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/styles/tokens.css'),
            'utf8',
        );
        const cssSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/PlayView.css'),
            'utf8',
        );

        const mintMatch = tokensSrc.match(/--color-mint:\s*(#[0-9a-fA-F]{6});/);
        const accentMatch = tokensSrc.match(/--color-accent:\s*(#[0-9a-fA-F]{6});/);
        const textMatch = tokensSrc.match(/--color-text:\s*(#[0-9a-fA-F]{6});/);
        const primaryMatch = tokensSrc.match(/--color-primary:\s*(#[0-9a-fA-F]{6});/);
        const secondaryMatch = tokensSrc.match(/--color-secondary:\s*(#[0-9a-fA-F]{6});/);

        assert.ok(mintMatch, '--color-mint deve estar definido em tokens.css');
        assert.equal(mintMatch[1].toLowerCase(), '#86efac');
        assert.ok(accentMatch && accentMatch[1].toLowerCase() === '#38bdf8');
        assert.ok(textMatch && primaryMatch && secondaryMatch);

        assert.match(
            cssSrc,
            /\.play-option--2\s*\{[^}]*background:\s*var\(--color-mint\);[^}]*color:\s*var\(--color-text\);[^}]*\}/,
        );
        assert.doesNotMatch(
            cssSrc,
            /\.play-option--2\s*\{[^}]*var\(--color-accent\)/,
        );
        assert.match(cssSrc, /\.play-option--2\s+\.play-option__letter/);

        assert.ok(contrastRatio(mintMatch[1], textMatch[1]) >= 4.5);
        assert.ok(contrastRatio(mintMatch[1], primaryMatch[1]) >= 3.0);
        assert.ok(contrastRatio(mintMatch[1], secondaryMatch[1]) >= 3.0);
    });

    it('7. Alternativa B substitui o branco por rosa-claro (#F9A8D4) preservando --color-surface e as demais cores', () => {
        const tokensSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/styles/tokens.css'),
            'utf8',
        );
        const cssSrc = readFileSync(
            path.resolve(import.meta.dirname, '../src/views/Play/PlayView.css'),
            'utf8',
        );

        const pinkMatch = tokensSrc.match(/--color-pink:\s*(#[0-9a-fA-F]{6});/);
        const surfaceMatch = tokensSrc.match(/--color-surface:\s*(#[0-9a-fA-F]{6});/);
        const coralMatch = tokensSrc.match(/--color-coral:\s*(#[0-9a-fA-F]{6});/);
        const mintMatch = tokensSrc.match(/--color-mint:\s*(#[0-9a-fA-F]{6});/);
        const highlightMatch = tokensSrc.match(/--color-highlight:\s*(#[0-9a-fA-F]{6});/);
        const textMatch = tokensSrc.match(/--color-text:\s*(#[0-9a-fA-F]{6});/);
        const primaryMatch = tokensSrc.match(/--color-primary:\s*(#[0-9a-fA-F]{6});/);
        const secondaryMatch = tokensSrc.match(/--color-secondary:\s*(#[0-9a-fA-F]{6});/);

        assert.ok(pinkMatch, '--color-pink deve estar definido em tokens.css');
        assert.equal(pinkMatch[1].toLowerCase(), '#f9a8d4');
        assert.ok(surfaceMatch && surfaceMatch[1].toLowerCase() === '#ffffff');
        assert.ok(coralMatch && coralMatch[1].toLowerCase() === '#ff9b54');
        assert.ok(mintMatch && mintMatch[1].toLowerCase() === '#86efac');
        assert.ok(highlightMatch && highlightMatch[1].toLowerCase() === '#facc15');
        assert.ok(textMatch && textMatch[1].toLowerCase() === '#0f172a');
        assert.ok(primaryMatch && secondaryMatch);

        assert.match(
            cssSrc,
            /\.play-option--1\s*\{[^}]*background:\s*var\(--color-pink\);[^}]*color:\s*var\(--color-text\);[^}]*\}/,
        );
        assert.doesNotMatch(
            cssSrc,
            /\.play-option--1\s*\{[^}]*var\(--color-surface\)/,
        );
        assert.match(cssSrc, /\.play-option--1\s+\.play-option__letter/);
        assert.match(
            cssSrc,
            /\.play-question__statement-card\s*\{[^}]*background:\s*var\(--color-surface\)/,
        );

        assert.ok(contrastRatio(pinkMatch[1], textMatch[1]) >= 4.5);
        assert.ok(contrastRatio(pinkMatch[1], primaryMatch[1]) >= 3.0);
        assert.ok(contrastRatio(pinkMatch[1], secondaryMatch[1]) >= 3.0);
    });

    it('8. Regra de referência calculatePoints no frontend acompanha o servidor (100 base + até 100 bônus, 0/-30 no erro)', () => {
        assert.equal(calculatePoints(true, 30_000, 30_000), 200);
        assert.equal(calculatePoints(true, 15_000, 30_000), 150);
        assert.equal(calculatePoints(true, 100, 30_000), 100);
        assert.equal(calculatePoints(false, 20_000, 30_000, 'CLASSIC'), 0);
        assert.equal(calculatePoints(false, 20_000, 30_000, 'HARDCORE'), -30);
    });
});
