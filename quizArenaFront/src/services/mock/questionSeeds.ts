/*
 * DADOS DE EXEMPLO (mock).
 *
 * Perguntas iniciais do banco de perguntas, usadas na primeira vez que o
 * painel é aberto no navegador. As três primeiras correspondem às
 * perguntas que já existiam fixas no Dashboard, agora com alternativas.
 */
import type { Question } from '../../models/question';

export const QUESTION_SEEDS: Question[] = [
    {
        id: 'seed-react-effects',
        statement: 'Qual hook do React é utilizado para gerenciar efeitos colaterais?',
        theme: 'React',
        type: 'MULTIPLE_CHOICE',
        isActive: true,
        options: [
            { id: 'seed-react-effects-a', text: 'useState', isCorrect: false },
            { id: 'seed-react-effects-b', text: 'useEffect', isCorrect: true },
            { id: 'seed-react-effects-c', text: 'useMemo', isCorrect: false },
            { id: 'seed-react-effects-d', text: 'useRef', isCorrect: false },
        ],
    },
    {
        id: 'seed-css',
        statement: 'O que significa a sigla CSS?',
        theme: 'Web',
        type: 'MULTIPLE_CHOICE',
        isActive: true,
        options: [
            { id: 'seed-css-a', text: 'Cascading Style Sheets', isCorrect: true },
            { id: 'seed-css-b', text: 'Computer Style Sheets', isCorrect: false },
            { id: 'seed-css-c', text: 'Creative Style System', isCorrect: false },
        ],
    },
    {
        id: 'seed-relational',
        statement: 'Qual banco de dados é estritamente relacional?',
        theme: 'Banco de Dados',
        type: 'MULTIPLE_CHOICE',
        isActive: false,
        options: [
            { id: 'seed-relational-a', text: 'MongoDB', isCorrect: false },
            { id: 'seed-relational-b', text: 'PostgreSQL', isCorrect: true },
            { id: 'seed-relational-c', text: 'Redis', isCorrect: false },
            { id: 'seed-relational-d', text: 'Cassandra', isCorrect: false },
        ],
    },
    {
        id: 'seed-html',
        statement: 'HTML é uma linguagem de programação.',
        theme: 'Web',
        type: 'TRUE_FALSE',
        isActive: true,
        options: [
            { id: 'seed-html-true', text: 'Verdadeiro', isCorrect: false },
            { id: 'seed-html-false', text: 'Falso', isCorrect: true },
        ],
    },
    {
        id: 'seed-typescript',
        statement: 'O TypeScript adiciona tipagem estática ao JavaScript.',
        theme: 'TypeScript',
        type: 'TRUE_FALSE',
        isActive: true,
        options: [
            { id: 'seed-typescript-true', text: 'Verdadeiro', isCorrect: true },
            { id: 'seed-typescript-false', text: 'Falso', isCorrect: false },
        ],
    },
];
