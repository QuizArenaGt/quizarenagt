import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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
});
