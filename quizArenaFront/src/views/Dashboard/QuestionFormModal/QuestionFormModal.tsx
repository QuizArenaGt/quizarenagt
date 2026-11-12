import Button from '../../../components/ui/Button/Button';
import Icon from '../../../components/ui/Icon/Icon';
import Modal from '../../../components/ui/Modal/Modal';
import {
    CHOICE_LETTERS,
    FALSE_LABEL,
    MAX_CHOICES,
    MIN_CHOICES,
    QUESTION_TYPE_LABEL,
    TRUE_LABEL,
    type Question,
    type QuestionType,
} from '../../../models/question';
import { useQuestionFormViewModel } from '../../../viewmodels/useQuestionFormViewModel';
import './QuestionFormModal.css';

interface QuestionFormModalProps {
    isOpen: boolean;
    /** Pergunta em edição; null para criar uma nova. */
    question: Question | null;
    onClose: () => void;
    onSave: (question: Question) => void;
}

const TYPE_HINT: Record<QuestionType, string> = {
    MULTIPLE_CHOICE: `De ${MIN_CHOICES} a ${MAX_CHOICES} alternativas`,
    TRUE_FALSE: 'Duas opções fixas',
};

/**
 * VIEW — modal de criação/edição de pergunta do painel do professor.
 * O Modal só monta o conteúdo quando está aberto, então o formulário (e
 * seu ViewModel) começa do zero a cada abertura.
 */
export default function QuestionFormModal({ isOpen, question, onClose, onSave }: QuestionFormModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title={question ? 'Editar pergunta' : 'Nova pergunta'}
            description="Escreva o enunciado, escolha o tipo e marque a resposta correta."
        >
            <QuestionForm initial={question} onSave={onSave} onCancel={onClose} />
        </Modal>
    );
}

interface QuestionFormProps {
    initial: Question | null;
    onSave: (question: Question) => void;
    onCancel: () => void;
}

function QuestionForm({ initial, onSave, onCancel }: QuestionFormProps) {
    const viewModel = useQuestionFormViewModel(initial, onSave);
    const { draft } = viewModel;

    return (
        <form className="question-form" onSubmit={viewModel.submit} noValidate>
            <div className="question-form__field">
                <label htmlFor="question-statement" className="question-form__label">
                    Enunciado
                </label>
                <textarea
                    id="question-statement"
                    className="question-form__input"
                    rows={3}
                    maxLength={300}
                    placeholder="Ex.: Qual é a capital do Brasil?"
                    value={draft.statement}
                    onChange={(event) => viewModel.setStatement(event.target.value)}
                />
            </div>

            <div className="question-form__field">
                <label htmlFor="question-theme" className="question-form__label">
                    Tema <span className="question-form__optional">(opcional)</span>
                </label>
                <input
                    id="question-theme"
                    className="question-form__input"
                    type="text"
                    maxLength={60}
                    placeholder="Ex.: Geografia"
                    value={draft.theme}
                    onChange={(event) => viewModel.setTheme(event.target.value)}
                />
            </div>

            <fieldset className="question-form__fieldset">
                <legend className="question-form__label">Tipo de resposta</legend>
                <div className="question-form__types">
                    {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((type) => (
                        <label
                            key={type}
                            className={`question-form__type${draft.type === type ? ' is-selected' : ''}`}
                        >
                            <input
                                type="radio"
                                name="question-type"
                                value={type}
                                checked={draft.type === type}
                                onChange={() => viewModel.setType(type)}
                            />
                            <span className="question-form__type-title">{QUESTION_TYPE_LABEL[type]}</span>
                            <span className="question-form__type-hint">{TYPE_HINT[type]}</span>
                        </label>
                    ))}
                </div>
            </fieldset>

            {draft.type === 'MULTIPLE_CHOICE' ? (
                <fieldset className="question-form__fieldset" aria-describedby="question-choices-hint">
                    <legend className="question-form__label">Alternativas</legend>
                    <p id="question-choices-hint" className="question-form__hint">
                        Marque o círculo da alternativa correta.
                    </p>

                    <ul className="question-form__choices">
                        {draft.choices.map((choice, index) => {
                            const letter = CHOICE_LETTERS[index];
                            const isCorrect = draft.correctChoiceId === choice.id;
                            return (
                                <li
                                    key={choice.id}
                                    className={`question-form__choice${isCorrect ? ' is-correct' : ''}`}
                                >
                                    <input
                                        type="radio"
                                        name="correct-choice"
                                        className="question-form__radio"
                                        checked={isCorrect}
                                        onChange={() => viewModel.setCorrectChoice(choice.id)}
                                        aria-label={`Marcar alternativa ${letter} como correta`}
                                    />
                                    <span className="question-form__letter" aria-hidden="true">
                                        {letter}
                                    </span>
                                    <input
                                        type="text"
                                        className="question-form__input question-form__choice-input"
                                        maxLength={120}
                                        placeholder={`Alternativa ${letter}`}
                                        aria-label={`Texto da alternativa ${letter}`}
                                        value={choice.text}
                                        onChange={(event) => viewModel.setChoiceText(choice.id, event.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="question-form__remove"
                                        onClick={() => viewModel.removeChoice(choice.id)}
                                        disabled={!viewModel.canRemoveChoice}
                                        aria-label={`Remover alternativa ${letter}`}
                                        title={
                                            viewModel.canRemoveChoice
                                                ? 'Remover alternativa'
                                                : `Mínimo de ${MIN_CHOICES} alternativas`
                                        }
                                    >
                                        <Icon name="close" size={18} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {viewModel.canAddChoice && (
                        <button type="button" className="question-form__add" onClick={viewModel.addChoice}>
                            + Adicionar alternativa
                        </button>
                    )}
                </fieldset>
            ) : (
                <fieldset className="question-form__fieldset">
                    <legend className="question-form__label">A afirmação é…</legend>
                    <div className="question-form__true-false">
                        {[true, false].map((value) => (
                            <label
                                key={String(value)}
                                className={`question-form__tf-option${draft.trueFalseAnswer === value ? ' is-selected' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="true-false-answer"
                                    checked={draft.trueFalseAnswer === value}
                                    onChange={() => viewModel.setTrueFalseAnswer(value)}
                                />
                                <Icon name={value ? 'check' : 'close'} size={20} />
                                {value ? TRUE_LABEL : FALSE_LABEL}
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}

            {viewModel.error && (
                <p className="question-form__error" role="alert">
                    {viewModel.error}
                </p>
            )}

            <div className="question-form__actions">
                <Button variant="secondary" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit">{viewModel.isEditing ? 'Salvar alterações' : 'Salvar pergunta'}</Button>
            </div>
        </form>
    );
}
