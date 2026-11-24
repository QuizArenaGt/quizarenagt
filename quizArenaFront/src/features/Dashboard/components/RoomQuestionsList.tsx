import { useState } from 'react';
import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import EmptyState from '../../../components/ui/EmptyState/EmptyState';
import Icon from '../../../components/ui/Icon/Icon';
import {
    CHOICE_LETTERS,
    DEFAULT_THEME,
    QUESTION_TYPE_LABEL,
    filterQuestions,
    type Question,
    type QuestionTypeFilter,
} from '../../../models/question';

interface RoomQuestionsListProps {
    questions: Question[];
    canEdit: boolean;
    onEdit: (question: Question) => void;
    onRequestDelete: (question: Question) => void;
}

const FILTER_OPTIONS: { id: QuestionTypeFilter; label: string }[] = [
    { id: 'ALL', label: 'Todas' },
    { id: 'MULTIPLE_CHOICE', label: 'Múltipla escolha' },
    { id: 'TRUE_FALSE', label: 'Verdadeiro ou falso' },
];

/** Listagem estruturada e filtrável de perguntas vinculadas à sala selecionada. */
export default function RoomQuestionsList({
    questions,
    canEdit,
    onEdit,
    onRequestDelete,
}: RoomQuestionsListProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<QuestionTypeFilter>('ALL');

    const filteredItems = filterQuestions(questions, searchQuery, typeFilter);
    const hasActiveFilters = searchQuery.trim().length > 0 || typeFilter !== 'ALL';

    function clearFilters() {
        setSearchQuery('');
        setTypeFilter('ALL');
    }

    return (
        <div className="question-bank">
            <div className="question-bank__filters" role="region" aria-label="Filtrar perguntas">
                <div className="rooms-search-field question-bank__search">
                    <span className="rooms-search-field__icon" aria-hidden="true">
                        <Icon name="search" size={16} />
                    </span>
                    <input
                        type="search"
                        className="rooms-search-input question-bank__search-input"
                        aria-label="Pesquisar pergunta por enunciado, categoria ou alternativa"
                        placeholder="Pesquisar por enunciado, categoria ou alternativa…"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    {searchQuery.length > 0 && (
                        <button
                            type="button"
                            className="rooms-search-clear"
                            onClick={() => setSearchQuery('')}
                            aria-label="Limpar busca de perguntas"
                        >
                            <Icon name="close" size={14} />
                        </button>
                    )}
                </div>

                <div className="question-bank__type-tabs" role="group" aria-label="Filtrar por tipo">
                    {FILTER_OPTIONS.map((option) => {
                        const isActive = typeFilter === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                className={`question-bank__filter-chip${isActive ? ' is-active' : ''}`}
                                aria-pressed={isActive}
                                onClick={() => setTypeFilter(option.id)}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>

                {hasActiveFilters && (
                    <span className="question-bank__filter-count">
                        {filteredItems.length} de {questions.length}
                    </span>
                )}
            </div>

            {filteredItems.length === 0 ? (
                <EmptyState
                    icon="search"
                    title="Nenhuma pergunta corresponde ao filtro"
                    description="Ajuste os termos de busca ou limpe os filtros para visualizar todas as perguntas da sala."
                    action={
                        <Button type="button" variant="secondary" onClick={clearFilters}>
                            Limpar filtros
                        </Button>
                    }
                />
            ) : (
                <ol className="question-bank__list">
                    {filteredItems.map(({ question, number }) => (
                        <li key={question.id} className="question-item">
                            <div className="question-item__head">
                                <div className="question-item__badges">
                                    <span className="question-item__number">#{number}</span>
                                    <Badge variant={question.type === 'TRUE_FALSE' ? 'info' : 'primary'}>
                                        {QUESTION_TYPE_LABEL[question.type]}
                                    </Badge>
                                    {question.theme.trim().length > 0 && question.theme !== DEFAULT_THEME && (
                                        <Badge variant="neutral">
                                            Categoria: {question.theme}
                                        </Badge>
                                    )}
                                    {question.type === 'MULTIPLE_CHOICE' && (
                                        <span className="question-item__meta-text">
                                            {question.options.length} alternativas
                                        </span>
                                    )}
                                </div>

                                {canEdit && (
                                    <div className="question-item__actions">
                                        <button
                                            type="button"
                                            className="btn-icon question-item__action-btn"
                                            onClick={() => onEdit(question)}
                                            aria-label={`Editar pergunta ${number}`}
                                        >
                                            <Icon name="edit" size={14} />
                                            <span>Editar</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-icon danger question-item__action-btn"
                                            onClick={() => onRequestDelete(question)}
                                            aria-label={`Excluir pergunta ${number}`}
                                        >
                                            <Icon name="delete" size={14} />
                                            <span>Excluir</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            <p className="question-item__statement">{question.statement}</p>

                            <ul className="question-item__options" aria-label={`Alternativas da pergunta ${number}`}>
                                {question.options.map((option, optionIdx) => (
                                    <li
                                        key={option.id}
                                        className={`question-item__option${option.isCorrect ? ' is-correct' : ''}`}
                                    >
                                        <span className="question-item__option-letter" aria-hidden="true">
                                            {CHOICE_LETTERS[optionIdx] ?? optionIdx + 1}
                                        </span>
                                        <span className="question-item__option-text">{option.text}</span>
                                        {option.isCorrect && (
                                            <span className="question-item__option-correct" title="Alternativa correta">
                                                <Icon name="check" size={14} />
                                                <span>Correta</span>
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}
