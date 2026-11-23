import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import Alert from '../../../components/ui/Alert/Alert';
import Badge from '../../../components/ui/Badge/Badge';
import Button from '../../../components/ui/Button/Button';
import Icon from '../../../components/ui/Icon/Icon';
import Modal from '../../../components/ui/Modal/Modal';
import { LoadingState } from '../../../components/ui/Skeleton/Skeleton';
import {
    CHOICE_LETTERS,
    QUESTION_TYPE_LABEL,
    type Question,
} from '../../../models/question';
import {
    MAX_IMPORT_QUESTIONS,
    canCloseImportModal,
    type ImportQuestionInput,
    type ImportQuestionsExecutionResult,
} from '../../../models/questionImport';
import type { BackendRoomStatus } from '../../../services/socket';
import { useImportQuestionsViewModel } from '../../../viewmodels/useImportQuestionsViewModel';
import './ImportQuestionsModal.css';

interface ImportQuestionsModalProps {
    isOpen: boolean;
    roomId: string | null;
    roomName: string;
    roomStatus: BackendRoomStatus | null;
    existingQuestions: readonly Question[];
    isImporting: boolean;
    onImportBatch: (
        questions: readonly ImportQuestionInput[],
    ) => Promise<ImportQuestionsExecutionResult>;
    onClose: () => void;
}

const EXAMPLE_JSON = `{
  "questions": [
    {
      "statement": "Qual protocolo garante entrega ordenada?",
      "type": "MULTIPLE_CHOICE",
      "options": [
        { "text": "UDP", "isCorrect": false },
        { "text": "TCP", "isCorrect": true }
      ]
    },
    {
      "statement": "O protocolo HTTPS usa TLS.",
      "type": "TRUE_FALSE",
      "options": [
        { "text": "Verdadeiro", "isCorrect": true },
        { "text": "Falso", "isCorrect": false }
      ]
    }
  ]
}`;

export default function ImportQuestionsModal(props: ImportQuestionsModalProps) {
    const { isOpen, roomName, ...vmParams } = props;

    function handleModalClose() {
        if (!canCloseImportModal(vmParams.isImporting)) {
            return;
        }
        vmParams.onClose();
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleModalClose}
            size="lg"
            title="Importar perguntas"
            description="Envie um arquivo .json para acrescentar perguntas em lote sem apagar as existentes na sala."
        >
            <ImportQuestionsModalBody
                roomName={roomName}
                vmParams={vmParams}
            />
        </Modal>
    );
}

interface ImportQuestionsModalBodyProps {
    roomName: string;
    vmParams: Omit<ImportQuestionsModalProps, 'isOpen' | 'roomName'>;
}

function ImportQuestionsModalBody({
    roomName,
    vmParams,
}: ImportQuestionsModalBodyProps) {
    const viewModel = useImportQuestionsViewModel(vmParams);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [copiedExample, setCopiedExample] = useState(false);
    const inputId = useId();
    const dropzoneHintId = useId();

    useEffect(() => {
        if (!copiedExample) return;
        const timer = window.setTimeout(() => setCopiedExample(false), 2000);
        return () => window.clearTimeout(timer);
    }, [copiedExample]);

    function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
        const picked = event.target.files?.[0] ?? null;
        event.target.value = '';
        void viewModel.selectFile(picked);
    }

    function handleDragOver(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        if (!viewModel.isImporting) {
            viewModel.setIsDragOver(true);
        }
    }

    function handleDragLeave(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        viewModel.setIsDragOver(false);
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        viewModel.setIsDragOver(false);
        if (viewModel.isImporting) return;
        const dropped = event.dataTransfer.files?.[0] ?? null;
        void viewModel.selectFile(dropped);
    }

    async function handleCopyExample() {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(EXAMPLE_JSON);
            }
            setCopiedExample(true);
        } catch {
            setCopiedExample(false);
        }
    }

    const isSuccessFinished =
        viewModel.outcome?.status === 'COMPLETED' ||
        viewModel.outcome?.status === 'PARTIAL';

    const outcomeVariant =
        viewModel.outcome?.tone === 'error'
            ? 'error'
            : viewModel.outcome?.tone === 'warning'
              ? 'warning'
              : 'success';

    return (
        <div className="import-modal">
            {!viewModel.isRoomEditable && !isSuccessFinished && (
                <Alert variant="warning" title="Sala indisponível para edição">
                    A importação só está disponível enquanto a sala estiver aguardando início.
                </Alert>
            )}

            {viewModel.outcome && (
                <Alert variant={outcomeVariant} title={viewModel.outcome.title}>
                    <p>{viewModel.outcome.message}</p>
                    {viewModel.outcome.fieldErrorMessages.length > 1 && (
                        <ul className="import-modal__error-list">
                            {viewModel.outcome.fieldErrorMessages.map((msg, idx) => (
                                <li key={`${idx}-${msg}`}>{msg}</li>
                            ))}
                        </ul>
                    )}
                </Alert>
            )}

            {isSuccessFinished ? (
                <div className="import-modal__actions">
                    <Button type="button" onClick={viewModel.handleRequestClose}>
                        Fechar
                    </Button>
                </div>
            ) : (
                <>
                    <div
                        className={`import-modal__dropzone${viewModel.isDragOver ? ' is-drag-over' : ''}${viewModel.isImporting ? ' is-disabled' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        aria-describedby={dropzoneHintId}
                    >
                        <input
                            id={inputId}
                            ref={fileInputRef}
                            type="file"
                            accept=".json,application/json"
                            className="import-modal__file-input"
                            disabled={viewModel.isImporting}
                            onChange={handleFileInputChange}
                            aria-label="Selecionar arquivo JSON com perguntas"
                        />

                        {!viewModel.selectedFile ? (
                            <div className="import-modal__dropzone-empty">
                                <span className="import-modal__dropzone-icon" aria-hidden="true">
                                    <Icon name="import" size={22} />
                                </span>
                                <p className="import-modal__dropzone-title">
                                    Arraste um arquivo <strong>.json</strong> para cá ou selecione do computador
                                </p>
                                <p id={dropzoneHintId} className="import-modal__dropzone-hint">
                                    Até 1 MB · máximo de {MAX_IMPORT_QUESTIONS} perguntas por arquivo · sem apagar perguntas atuais.
                                </p>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={viewModel.isImporting}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Selecionar arquivo JSON
                                </Button>
                            </div>
                        ) : (
                            <div className="import-modal__file-bar">
                                <div className="import-modal__file-meta">
                                    <span className="import-modal__file-name">
                                        {viewModel.selectedFile.name}
                                    </span>
                                    <span className="import-modal__file-details">
                                        Tamanho: <strong>{viewModel.formattedFileSize}</strong>
                                        {viewModel.validation?.valid && (
                                            <>
                                                {' '}·{' '}
                                                <strong>{viewModel.validation.questions.length}</strong>{' '}
                                                {viewModel.validation.questions.length === 1
                                                    ? 'pergunta detectada'
                                                    : 'perguntas detectadas'}
                                            </>
                                        )}
                                    </span>
                                </div>
                                <div className="import-modal__file-actions">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        disabled={viewModel.isImporting}
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        Trocar arquivo
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={viewModel.isImporting}
                                        onClick={viewModel.clearFile}
                                    >
                                        Remover
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {!viewModel.selectedFile && (
                        <div className="import-modal__guidance">
                            <ul className="import-modal__rules" aria-label="Regras do arquivo JSON">
                                <li>Objeto raiz com a lista <code>questions</code>.</li>
                                <li>Tipos aceitos: <code>MULTIPLE_CHOICE</code> (2–4 opções) e <code>TRUE_FALSE</code>.</li>
                                <li>Exatamente 1 alternativa com <code>isCorrect: true</code> por pergunta.</li>
                            </ul>

                            <details className="import-modal__example">
                                <summary>Ver exemplo do formato JSON oficial</summary>
                                <div className="import-modal__code-toolbar">
                                    <span>Estrutura esperada</span>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => void handleCopyExample()}
                                    >
                                        <Icon name="copy" size={14} />
                                        <span>{copiedExample ? 'Copiado!' : 'Copiar exemplo'}</span>
                                    </Button>
                                </div>
                                <pre className="import-modal__code">{EXAMPLE_JSON}</pre>
                            </details>
                        </div>
                    )}

                    {viewModel.isReadingFile && (
                        <LoadingState label="Lendo e validando arquivo JSON…" />
                    )}

                    {viewModel.readError && (
                        <Alert variant="error" title="Erro ao ler o arquivo">
                            {viewModel.readError}
                        </Alert>
                    )}

                    {viewModel.validation && !viewModel.validation.valid && (
                        <Alert
                            variant="error"
                            title={`Foram encontrados problemas no arquivo (${viewModel.validation.errors.length})`}
                        >
                            <p>Corrija os itens abaixo antes de importar:</p>
                            <ul className="import-modal__error-list">
                                {viewModel.validation.errors.map((err, idx) => (
                                    <li key={`${err.questionNumber ?? 'file'}-${err.field}-${idx}`}>
                                        {err.message}
                                    </li>
                                ))}
                            </ul>
                        </Alert>
                    )}

                    {viewModel.validation && viewModel.validation.valid && (
                        <div className="import-modal__preview-section">
                            <div className="import-modal__summary-bar" role="status">
                                <span>
                                    <strong>{viewModel.validation.questions.length}</strong>{' '}
                                    {viewModel.validation.questions.length === 1
                                        ? 'pergunta válida pronta para acrescentar'
                                        : 'perguntas válidas prontas para acrescentar'}{' '}
                                    à sala <strong>{roomName}</strong>.
                                </span>
                            </div>

                            {viewModel.validation.warnings.length > 0 && (
                                <Alert
                                    variant="warning"
                                    title={`Aviso: ${viewModel.validation.warnings.length} ${
                                        viewModel.validation.warnings.length === 1
                                            ? 'enunciado já existe'
                                            : 'enunciados já existem'
                                    } na sala`}
                                >
                                    Essas perguntas serão acrescentadas normalmente caso você confirme a importação (itens:{' '}
                                    {viewModel.validation.warnings
                                        .map((w) => `#${w.questionNumber}`)
                                        .join(', ')}
                                    ).
                                </Alert>
                            )}

                            <div className="import-modal__preview-header">
                                <h3>
                                    Pré-visualização ({viewModel.pagination.startIndex + 1}–
                                    {viewModel.pagination.endIndex} de {viewModel.pagination.totalItems})
                                </h3>
                                {viewModel.pagination.totalPages > 1 && (
                                    <div className="import-modal__pagination">
                                        <button
                                            type="button"
                                            className="import-modal__page-btn"
                                            disabled={!viewModel.pagination.hasPrevious || viewModel.isImporting}
                                            onClick={() =>
                                                viewModel.setPage(viewModel.pagination.currentPage - 1)
                                            }
                                        >
                                            Anterior
                                        </button>
                                        <span className="import-modal__page-info">
                                            Página {viewModel.pagination.currentPage} de{' '}
                                            {viewModel.pagination.totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            className="import-modal__page-btn"
                                            disabled={!viewModel.pagination.hasNext || viewModel.isImporting}
                                            onClick={() =>
                                                viewModel.setPage(viewModel.pagination.currentPage + 1)
                                            }
                                        >
                                            Próxima
                                        </button>
                                    </div>
                                )}
                            </div>

                            <ol className="import-modal__preview-list">
                                {viewModel.pagination.items.map((item) => (
                                    <li key={item.questionNumber} className="import-modal__preview-item">
                                        <div className="import-modal__preview-meta">
                                            <Badge variant="primary">#{item.questionNumber}</Badge>
                                            <Badge variant={item.question.type === 'TRUE_FALSE' ? 'info' : 'neutral'}>
                                                {QUESTION_TYPE_LABEL[item.question.type]}
                                            </Badge>
                                            {item.duplicateInRoom && (
                                                <Badge variant="warning">
                                                    <Icon name="warning" size={12} />
                                                    <span>Já existe na sala</span>
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="import-modal__statement">
                                            {item.question.statement}
                                        </p>
                                        <ul className="import-modal__options">
                                            {item.question.options.map((opt, optIdx) => (
                                                <li
                                                    key={`${item.questionNumber}-${optIdx}`}
                                                    className={`import-modal__option${opt.isCorrect ? ' is-correct' : ''}`}
                                                >
                                                    <span className="import-modal__option-letter" aria-hidden="true">
                                                        {CHOICE_LETTERS[optIdx] ?? optIdx + 1}
                                                    </span>
                                                    <span className="import-modal__option-text">
                                                        {opt.text}
                                                    </span>
                                                    {opt.isCorrect && (
                                                        <span className="import-modal__correct-tag">
                                                            <Icon name="check" size={14} />
                                                            Correta
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    {viewModel.isImporting && (
                        <LoadingState label="Importando perguntas para a sala… Aguarde a conclusão." />
                    )}

                    <div className="import-modal__actions">
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={!viewModel.canClose}
                            onClick={viewModel.handleRequestClose}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            disabled={!viewModel.canConfirm}
                            isLoading={viewModel.isImporting}
                            onClick={() => void viewModel.confirmImport()}
                        >
                            {viewModel.isImporting
                                ? 'Importando…'
                                : viewModel.outcome?.canRetry
                                  ? `Tentar novamente (${viewModel.validation?.valid ? viewModel.validation.questions.length : 0})`
                                  : viewModel.validation?.valid
                                    ? `Confirmar importação (${viewModel.validation.questions.length})`
                                    : 'Confirmar importação'}
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
