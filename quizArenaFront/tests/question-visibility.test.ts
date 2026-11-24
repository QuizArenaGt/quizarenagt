import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveQuestionVisibilityState,
    toggleQuestionVisibilityPreference,
} from '../src/views/Play/steps/questionVisibility.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Ocultar pergunta automaticamente após responder e alternar manualmente (QuestionStep)', () => {
    it('1. antes de responder, pergunta e alternativas ficam visíveis e controle de ocultar não aparece', () => {
        const beforeAnswer = resolveQuestionVisibilityState({
            hasSubmittedAnswer: false,
            isSubmittingAnswer: false,
            answerError: null,
            manualVisibilityOverride: null,
        });
        assert.deepEqual(beforeAnswer, {
            canHideQuestion: false,
            isQuestionHidden: false,
        });

        assert.equal(
            toggleQuestionVisibilityPreference(null, {
                hasSubmittedAnswer: false,
                isSubmittingAnswer: false,
                answerError: null,
            }),
            null,
        );

        const qSrc = readFrontFile('src/views/Play/steps/QuestionStep.tsx');
        assert.match(qSrc, /\{canHideQuestion && \([\s\S]*?Ocultar pergunta[\s\S]*?\)\}/);
    });

    it('2. durante o envio (isSubmittingAnswer=true) ou em erro, a pergunta permanece visível', () => {
        // Enquanto está enviando ao servidor
        assert.deepEqual(
            resolveQuestionVisibilityState({
                hasSubmittedAnswer: false,
                isSubmittingAnswer: true,
                answerError: null,
                manualVisibilityOverride: null,
            }),
            { canHideQuestion: false, isQuestionHidden: false },
        );

        // Falha no envio mantém pergunta visível e exibe erro
        assert.deepEqual(
            resolveQuestionVisibilityState({
                hasSubmittedAnswer: false,
                isSubmittingAnswer: false,
                answerError: 'Tempo esgotado para envio.',
                manualVisibilityOverride: null,
            }),
            { canHideQuestion: false, isQuestionHidden: false },
        );

        // Erro ativo impede ocultar mesmo se hasSubmittedAnswer fosse true
        assert.equal(
            toggleQuestionVisibilityPreference(null, {
                hasSubmittedAnswer: true,
                isSubmittingAnswer: false,
                answerError: 'Erro inesperado',
            }),
            null,
        );
    });

    it('3 e 4. após confirmação bem-sucedida do servidor, oculta automaticamente e exibe o card de confirmação', () => {
        const autoHiddenOnConfirm = resolveQuestionVisibilityState({
            hasSubmittedAnswer: true,
            isSubmittingAnswer: false,
            answerError: null,
            manualVisibilityOverride: null,
        });
        assert.deepEqual(autoHiddenOnConfirm, {
            canHideQuestion: true,
            isQuestionHidden: true,
        });

        const qSrc = readFrontFile('src/views/Play/steps/QuestionStep.tsx');
        const hiddenBranchMatch = qSrc.match(
            /\{isQuestionHidden \? \(([\s\S]*?)\) : \(\s*<>([\s\S]*?)<\/>\s*\)\}/,
        );
        assert.ok(hiddenBranchMatch, 'QuestionStep deve alternar entre tela oculta e pergunta completa');

        const hiddenBranch = hiddenBranchMatch[1];
        const visibleBranch = hiddenBranchMatch[2];

        assert.match(hiddenBranch, /play-question__hidden-card/);
        assert.match(hiddenBranch, /Resposta enviada!/);
        assert.match(hiddenBranch, /Aguardando os demais jogadores\.\.\./);
        assert.match(hiddenBranch, /Mostrar pergunta/);
        assert.doesNotMatch(hiddenBranch, /play-question__statement-card/);
        assert.doesNotMatch(hiddenBranch, /play-options/);

        assert.match(visibleBranch, /play-question__statement-card/);
        assert.match(visibleBranch, /play-options/);
    });

    it('5 e 6. clicar em "Mostrar pergunta" restaura enunciado e alternativas preservando seleção e bloqueio, permitindo ocultar novamente', () => {
        // Estado inicial após confirmação é oculto (manualVisibilityOverride=null -> isQuestionHidden=true)
        const showOverride = toggleQuestionVisibilityPreference(null, {
            hasSubmittedAnswer: true,
            isSubmittingAnswer: false,
            answerError: null,
        });
        assert.equal(showOverride, false);

        const shownState = resolveQuestionVisibilityState({
            hasSubmittedAnswer: true,
            isSubmittingAnswer: false,
            answerError: null,
            manualVisibilityOverride: showOverride,
        });
        assert.deepEqual(shownState, {
            canHideQuestion: true,
            isQuestionHidden: false,
        });

        // Jogador pode alternar manualmente de volta para oculta ("Ocultar pergunta")
        const rehideOverride = toggleQuestionVisibilityPreference(showOverride, {
            hasSubmittedAnswer: true,
            isSubmittingAnswer: false,
            answerError: null,
        });
        assert.equal(rehideOverride, true);
        assert.deepEqual(
            resolveQuestionVisibilityState({
                hasSubmittedAnswer: true,
                isSubmittingAnswer: false,
                answerError: null,
                manualVisibilityOverride: rehideOverride,
            }),
            { canHideQuestion: true, isQuestionHidden: true },
        );

        const qSrc = readFrontFile('src/views/Play/steps/QuestionStep.tsx');
        assert.match(qSrc, /onClick=\{handleShowQuestion\}[\s\S]*Mostrar pergunta/);
        assert.match(qSrc, /onClick=\{handleHideQuestion\}[\s\S]*Ocultar pergunta/);
        assert.match(qSrc, /const isSelected = selectedOptionId === option\.id;/);
        assert.match(qSrc, /const isLocked = hasSubmittedAnswer \|\| isSubmittingAnswer \|\| isExpired;/);
        assert.match(qSrc, /disabled=\{isLocked\}/);
        assert.match(qSrc, /Resposta registrada e bloqueada!/);
    });

    it('7. alternar entre mostrar e ocultar não dispara novo envio nem altera regras de submissão', () => {
        const qSrc = readFrontFile('src/views/Play/steps/QuestionStep.tsx');

        const hideStart = qSrc.indexOf('function handleHideQuestion');
        const showStart = qSrc.indexOf('function handleShowQuestion');
        const afterShow = qSrc.indexOf('const isTimeSynced', showStart);
        assert.ok(hideStart !== -1 && showStart !== -1 && afterShow !== -1);

        const toggleHandlersSlice = qSrc.slice(hideStart, afterShow);
        assert.doesNotMatch(toggleHandlersSlice, /onAnswer/);
        assert.doesNotMatch(toggleHandlersSlice, /submitPlayerRoundAnswer/);
        assert.doesNotMatch(toggleHandlersSlice, /fetch\(/);
        assert.doesNotMatch(toggleHandlersSlice, /socket/i);
    });

    it('8. nova pergunta começa visível e oculta automaticamente somente após nova confirmação; transição para FeedbackStep preservada', () => {
        // Nova instância de QuestionStep começa com manualVisibilityOverride=null e hasSubmittedAnswer=false -> visível
        assert.deepEqual(
            resolveQuestionVisibilityState({
                hasSubmittedAnswer: false,
                isSubmittingAnswer: false,
                answerError: null,
                manualVisibilityOverride: null,
            }),
            { canHideQuestion: false, isQuestionHidden: false },
        );

        // Após confirmação na nova pergunta, volta a ocultar automaticamente
        assert.deepEqual(
            resolveQuestionVisibilityState({
                hasSubmittedAnswer: true,
                isSubmittingAnswer: false,
                answerError: null,
                manualVisibilityOverride: null,
            }),
            { canHideQuestion: true, isQuestionHidden: true },
        );

        const playViewSrc = readFrontFile('src/views/Play/PlayView.tsx');
        const playVmSrc = readFrontFile('src/viewmodels/usePlayViewModel.ts');

        assert.match(
            playViewSrc,
            /phase === 'question' && viewModel\.currentQuestion[\s\S]*<QuestionStep[\s\S]*key=\{`\$\{viewModel\.questionNumber\}-\$\{viewModel\.currentQuestion\.id\}`\}/,
        );
        assert.match(playViewSrc, /phase === 'feedback' && viewModel\.currentQuestion && viewModel\.lastAnswer[\s\S]*<FeedbackStep/);
        assert.match(playVmSrc, /setPhase\('feedback'\)/);
        assert.doesNotMatch(playVmSrc, /manualVisibilityOverride|Ocultar pergunta|questionVisibility/);
    });

    it('9. preferência é individual/local por jogador e respeita acessibilidade e reduced-motion', () => {
        // Jogador A respondeu -> oculta automaticamente para A; Jogador B ainda não respondeu -> visível para B
        const playerAState = resolveQuestionVisibilityState({
            hasSubmittedAnswer: true,
            isSubmittingAnswer: false,
            answerError: null,
            manualVisibilityOverride: null,
        });
        const playerBState = resolveQuestionVisibilityState({
            hasSubmittedAnswer: false,
            isSubmittingAnswer: false,
            answerError: null,
            manualVisibilityOverride: null,
        });
        assert.equal(playerAState.isQuestionHidden, true);
        assert.equal(playerBState.isQuestionHidden, false);

        // Jogador A clica em "Mostrar pergunta"; outro jogador (C) que também respondeu continua oculto
        const playerAOverride = toggleQuestionVisibilityPreference(null, {
            hasSubmittedAnswer: true,
            isSubmittingAnswer: false,
            answerError: null,
        });
        assert.equal(
            resolveQuestionVisibilityState({
                hasSubmittedAnswer: true,
                isSubmittingAnswer: false,
                answerError: null,
                manualVisibilityOverride: playerAOverride,
            }).isQuestionHidden,
            false,
        );
        assert.equal(
            resolveQuestionVisibilityState({
                hasSubmittedAnswer: true,
                isSubmittingAnswer: false,
                answerError: null,
                manualVisibilityOverride: null,
            }).isQuestionHidden,
            true,
        );

        const qSrc = readFrontFile('src/views/Play/steps/QuestionStep.tsx');
        const cssSrc = readFrontFile('src/views/Play/PlayView.css');

        assert.match(qSrc, /useState<boolean \| null>\(null\)/);
        assert.doesNotMatch(qSrc, /localStorage|sessionStorage|socket/);
        assert.match(cssSrc, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.play-question__hidden-card/);
    });
});
