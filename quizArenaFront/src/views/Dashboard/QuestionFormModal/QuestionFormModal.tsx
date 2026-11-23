import Alert from '../../../components/ui/Alert/Alert';
import Button from '../../../components/ui/Button/Button';
import Icon from '../../../components/ui/Icon/Icon';
import Modal from '../../../components/ui/Modal/Modal';
import {
    CHOICE_LETTERS,
    FALSE_LABEL,
    MAX_CHOICES,
    MIN_CHOICES,
    QUESTION_TYPE_LABEL,
    STATEMENT_MAX_LENGTH,
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
    onSave: (question: Question) => Promise<void> | void;
}

type QuestionErrorTarget = 'statement' | 'choices' | 'trueFalse' | 'general';

const TYPE_HINT: Record<QuestionType, string> = {
    MULTIPLE_CHOICE: `${MIN_CHOICES} a ${MAX_CHOICES} alternativas`,
    TRUE_FALSE: 'Duas opções fixas',
};

function classifyErrorTarget(error: string | null): QuestionErrorTarget | null {
    if (!error) return null;
    const lower = error.toLocaleLowerCase();
    if (lower.includes('enunciado')) return 'statement';
    if (lower.includes('verdadeira') || lower.includes('falsa')) return 'trueFalse';
    if (lower.includes('alternativa')) return 'choices';
    return 'general';
}

/**
 * VIEW — modal de criação/edição de pergunta do painel do anfitrião.
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
    onSave: (question: Question) => Promise<void> | void;
    onCancel: () => void;
}

function QuestionForm({ initial, onSave, onCancel }: QuestionFormProps) {
    const viewModel = useQuestionFormViewModel(initial, onSave);
    const { draft } = viewModel;
    const errorTarget = classifyErrorTarget(viewModel.error);

    return (
        <form className="question-form" onSubmit={viewModel.submit} noValidate>
            <div className="question-form__top-row">
                <div className="question-form__field question-form__field--statement">
                    <div className="question-form__label-row">
                        <label htmlFor="question-statement" className="question-form__label">
                            Enunciado
                        </label>
                        <span className="question-form__counter">
                            {draft.statement.length}/{STATEMENT_MAX_LENGTH}
                        </span>
                    </div>
                    <textarea
                        id="question-statement"
                        className={`question-form__input${errorTarget === 'statement' ? ' is-invalid' : ''}`}
                        rows={2}
                        maxLength={STATEMENT_MAX_LENGTH}
                        placeholder="Ex.: Qual é a capital do Brasil?"
                        value={draft.statement}
                        aria-invalid={errorTarget === 'statement' || undefined}
                        aria-describedby={errorTarget === 'statement' ? 'question-statement-error' : undefined}
                        onChange={(event) => viewModel.setStatement(event.target.value)}
                    />
                    {errorTarget === 'statement' && viewModel.error && (
                        <p id="question-statement-error" className="question-form__field-error" role="alert">
                            {viewModel.error}
                        </p>
                    )}
                </div>

                <div className="question-form__field question-form__field--theme">
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
                <fieldset
                    className={`question-form__fieldset${errorTarget === 'choices' ? ' is-invalid' : ''}`}
                    aria-describedby="question-choices-hint"
                >
                    <div className="question-form__label-row">
                        <legend className="question-form__label">Alternativas</legend>
                        <span id="question-choices-hint" className="question-form__hint">
                            Selecione qual é a correta
                        </span>
                    </div>

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
                                    {isCorrect && (
                                        <span className="question-form__correct-pill">
                                            <Icon name="check" size={13} />
                                            <span>Correta</span>
                                        </span>
                                    )}
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
                                        <Icon name="close" size={16} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    {errorTarget === 'choices' && viewModel.error && (
                        <p className="question-form__field-error" role="alert">
                            {viewModel.error}
                        </p>
                    )}

                    {viewModel.canAddChoice && (
                        <button type="button" className="question-form__add" onClick={viewModel.addChoice}>
                            + Adicionar alternativa
                        </button>
                    )}
                </fieldset>
            ) : (
                <fieldset className="question-form__fieldset">
                    <div className="question-form__label-row">
                        <legend className="question-form__label">Resposta correta</legend>
                        <span className="question-form__hint">Escolha se a afirmação é verdadeira ou falsa</span>
                    </div>
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
                                <Icon name={value ? 'check' : 'close'} size={18} />
                                <span>{value ? TRUE_LABEL : FALSE_LABEL}</span>
                            </label>
                        ))}
                    </div>
                    {errorTarget === 'trueFalse' && viewModel.error && (
                        <p className="question-form__field-error" role="alert">
                            {viewModel.error}
                        </p>
                    )}
                </fieldset>
            )}

            {errorTarget === 'general' && viewModel.error && (
                <Alert variant="error">{viewModel.error}</Alert>
            )}

            <div className="question-form__actions">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                    disabled={viewModel.isSaving}
                >
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    variant="primary"
                    disabled={viewModel.isSaving}
                    isLoading={viewModel.isSaving}
                >
                    {viewModel.isSaving
                        ? 'Salvando…'
                        : viewModel.isEditing
                          ? 'Salvar alterações'
                          : 'Salvar pergunta'}
                </Button>
            </div>
        </form>
    );
}
