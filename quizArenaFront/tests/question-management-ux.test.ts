import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterQuestions } from '../src/models/question.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
}

describe('Perguntas da Sala (Question Management UX)', () => {
    it('filterQuestions filtra por enunciado, alternativa, tema e tipo preservando numeração original', () => {
        const sample = [
            {
                statement: 'Qual protocolo garante entrega ordenada?',
                theme: 'Redes',
                type: 'MULTIPLE_CHOICE' as const,
                options: [
                    { id: '1', text: 'UDP', isCorrect: false },
                    { id: '2', text: 'TCP', isCorrect: true },
                ],
            },
            {
                statement: 'HTTPS utiliza criptografia TLS.',
                theme: 'Segurança',
                type: 'TRUE_FALSE' as const,
                options: [
                    { id: '3', text: 'Verdadeiro', isCorrect: true },
                    { id: '4', text: 'Falso', isCorrect: false },
                ],
            },
            {
                statement: 'Qual hook gerencia estado no React?',
                theme: 'Frontend',
                type: 'MULTIPLE_CHOICE' as const,
                options: [
                    { id: '5', text: 'useState', isCorrect: true },
                    { id: '6', text: 'useMemo', isCorrect: false },
                ],
            },
        ];

        assert.equal(filterQuestions(sample, '', 'ALL').length, 3);

        // Filtro por alternativa preservando índice original (#3)
        const byOption = filterQuestions(sample, 'usestate', 'ALL');
        assert.deepEqual(
            byOption.map((item) => item.number),
            [3],
        );

        // Filtro combinado tipo + enunciado case-insensitive
        const tfOnly = filterQuestions(sample, 'tls', 'TRUE_FALSE');
        assert.deepEqual(
            tfOnly.map((item) => item.number),
            [2],
        );

        assert.deepEqual(filterQuestions(sample, 'tls', 'MULTIPLE_CHOICE'), []);
    });

    it('RoomQuestionsList e DashboardForm oferecem filtros, destaque da correta e confirmação de exclusão', () => {
        const listSource = readFrontFile('src/features/Dashboard/components/RoomQuestionsList.tsx');
        const dashboardSource = readFrontFile('src/features/Dashboard/components/DashboardForm.tsx');

        assert.match(listSource, /filterQuestions/);
        assert.match(listSource, /Limpar filtros/);
        assert.match(listSource, /question-item__option-correct/);
        assert.match(listSource, /onEdit\(question\)/);
        assert.match(listSource, /onRequestDelete\(question\)/);

        assert.match(dashboardSource, /<RoomQuestionsList/);
        assert.match(dashboardSource, /title="Excluir pergunta\?"/);
        assert.match(dashboardSource, /handleConfirmDeleteQuestion/);
        assert.match(dashboardSource, /Mínimo/);
    });

    it('QuestionFormModal posiciona erros perto dos campos e fixa ações no rodapé', () => {
        const modalSource = readFrontFile('src/views/Dashboard/QuestionFormModal/QuestionFormModal.tsx');
        const modalCss = readFrontFile('src/views/Dashboard/QuestionFormModal/QuestionFormModal.css');

        assert.match(modalSource, /classifyErrorTarget/);
        assert.match(modalSource, /aria-invalid=\{errorTarget === 'statement'/);
        assert.match(modalSource, /question-form__counter/);
        assert.match(modalSource, /question-form__correct-pill/);
        assert.match(modalSource, /isLoading=\{viewModel\.isSaving\}/);

        assert.match(modalCss, /\.question-form__actions\s*\{[\s\S]*position:\s*sticky;\s*\r?\n\s*bottom:\s*0;/);
        assert.match(modalCss, /\.question-form__top-row\s*\{/);
    });

    it('ImportQuestionsModal usa Alert, Badge, LoadingState e copiar exemplo sem emojis', () => {
        const importSource = readFrontFile('src/views/Dashboard/ImportQuestionsModal/ImportQuestionsModal.tsx');
        const importCss = readFrontFile('src/views/Dashboard/ImportQuestionsModal/ImportQuestionsModal.css');

        assert.match(importSource, /<Alert variant=/);
        assert.match(importSource, /<LoadingState label=/);
        assert.match(importSource, /<Badge variant="warning">/);
        assert.match(importSource, /Copiar exemplo/);
        assert.match(importSource, /canCloseImportModal\(vmParams\.isImporting\)/);
        assert.match(importSource, /accept="\.json,application\/json"/);
        assert.doesNotMatch(importSource, /⚠/);

        assert.match(importCss, /\.import-modal__actions\s*\{[\s\S]*position:\s*sticky;\s*\r?\n\s*bottom:\s*0;/);
    });

    it('UI diferencia Tema (geral da sala) de Categoria (específica da pergunta) sem alterar modelos', () => {
        const modalSource = readFrontFile('src/views/Dashboard/QuestionFormModal/QuestionFormModal.tsx');
        const listSource = readFrontFile('src/features/Dashboard/components/RoomQuestionsList.tsx');
        const workspaceSource = readFrontFile('src/features/Dashboard/components/RoomWorkspaceShell.tsx');
        const settingsSource = readFrontFile('src/features/Dashboard/components/RoomSettingsSection.tsx');
        const dashboardSource = readFrontFile('src/features/Dashboard/components/DashboardForm.tsx');

        // Pergunta usa o rótulo "Categoria" preservando propriedade/id do campo
        assert.match(modalSource, /htmlFor="question-theme"[\s\S]*Categoria/);
        assert.doesNotMatch(modalSource, /htmlFor="question-theme"[\s\S]*>\s*Tema\b/);
        assert.match(modalSource, /draft\.theme/);
        assert.match(listSource, /Pesquisar por enunciado, categoria ou alternativa/);
        assert.match(listSource, /Categoria:\s*\{question\.theme\}/);

        // Sala mantém o rótulo "Tema"
        assert.match(workspaceSource, />Tema:<\/span>/);
        assert.match(settingsSource, /<dt>Tema<\/dt>/);
        assert.match(dashboardSource, /htmlFor="room-theme">Tema<\/label>/);
    });
});
