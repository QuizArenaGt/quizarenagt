import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '../models/question';
import {
    PREVIEW_PAGE_SIZE,
    applyValidatedJsonTextToModalState,
    canCloseImportModal,
    canConfirmImportState,
    createInitialImportModalState,
    describeImportOutcome,
    findRoomStatementDuplicates,
    formatImportFileSize,
    paginatePreviewItems,
    validateImportFileMeta,
    type ImportModalState,
    type ImportQuestionInput,
    type ImportQuestionsExecutionResult,
    type QuestionImportValidationResult,
} from '../models/questionImport';
import type { BackendRoomStatus } from '../services/socket';

export interface UseImportQuestionsViewModelParams {
    roomId: string | null;
    roomStatus: BackendRoomStatus | null;
    existingQuestions: readonly Question[];
    isImporting: boolean;
    onImportBatch: (
        questions: readonly ImportQuestionInput[],
    ) => Promise<ImportQuestionsExecutionResult>;
    onClose: () => void;
}

export function useImportQuestionsViewModel({
    roomId,
    roomStatus,
    existingQuestions,
    isImporting,
    onImportBatch,
    onClose,
}: UseImportQuestionsViewModelParams) {
    const [state, setState] = useState<ImportModalState>(() =>
        createInitialImportModalState(),
    );
    const [prevRoomId, setPrevRoomId] = useState<string | null>(roomId);
    const [isDragOver, setIsDragOver] = useState(false);

    const readRequestSeqRef = useRef(0);
    const activeRoomIdRef = useRef<string | null>(roomId);
    const existingQuestionsRef = useRef<readonly Question[]>(existingQuestions);

    if (roomId !== prevRoomId) {
        setPrevRoomId(roomId);
        setState(createInitialImportModalState());
        setIsDragOver(false);
    }

    useEffect(() => {
        activeRoomIdRef.current = roomId;
        readRequestSeqRef.current += 1;
    }, [roomId]);

    useEffect(() => {
        existingQuestionsRef.current = existingQuestions;
    }, [existingQuestions]);

    const effectiveValidation = useMemo<QuestionImportValidationResult | null>(() => {
        if (!state.validation || !state.validation.valid) {
            return state.validation;
        }

        const { previewItems, warnings } = findRoomStatementDuplicates(
            state.validation.questions,
            existingQuestions,
        );

        return {
            valid: true,
            questions: state.validation.questions,
            previewItems,
            warnings,
        };
    }, [state.validation, existingQuestions]);

    const effectiveState = useMemo<ImportModalState>(
        () => ({
            ...state,
            validation: effectiveValidation,
        }),
        [state, effectiveValidation],
    );

    const pagination = useMemo(() => {
        if (!effectiveValidation || !effectiveValidation.valid) {
            return paginatePreviewItems([], 1, PREVIEW_PAGE_SIZE);
        }
        return paginatePreviewItems(
            effectiveValidation.previewItems,
            state.page,
            PREVIEW_PAGE_SIZE,
        );
    }, [effectiveValidation, state.page]);

    const isRoomEditable = roomId !== null && roomStatus === 'WAITING';

    const canConfirm = canConfirmImportState({
        state: effectiveState,
        roomId,
        roomStatus,
        isImporting,
    });

    const selectFile = useCallback(
        async (file: File | null) => {
            if (!file || isImporting) return;

            const requestSeq = ++readRequestSeqRef.current;
            const targetRoomId = activeRoomIdRef.current;
            const selectedFileMeta = {
                name: file.name,
                size: file.size,
                type: file.type,
            };

            const metaCheck = validateImportFileMeta(selectedFileMeta);
            if (!metaCheck.valid) {
                setState({
                    selectedFile: selectedFileMeta,
                    rawJsonText: null,
                    validation: { valid: false, errors: metaCheck.errors },
                    readError: null,
                    isReadingFile: false,
                    page: 1,
                    outcome: null,
                });
                return;
            }

            setState({
                selectedFile: selectedFileMeta,
                rawJsonText: null,
                validation: null,
                readError: null,
                isReadingFile: true,
                page: 1,
                outcome: null,
            });

            try {
                const rawText = await file.text();

                if (
                    readRequestSeqRef.current !== requestSeq ||
                    activeRoomIdRef.current !== targetRoomId
                ) {
                    return;
                }

                setState(
                    applyValidatedJsonTextToModalState(
                        selectedFileMeta,
                        rawText,
                        existingQuestionsRef.current,
                    ),
                );
            } catch {
                if (
                    readRequestSeqRef.current !== requestSeq ||
                    activeRoomIdRef.current !== targetRoomId
                ) {
                    return;
                }

                setState({
                    selectedFile: selectedFileMeta,
                    rawJsonText: null,
                    validation: null,
                    readError:
                        'Não foi possível ler o arquivo selecionado. Tente novamente com outro arquivo.',
                    isReadingFile: false,
                    page: 1,
                    outcome: null,
                });
            }
        },
        [isImporting],
    );

    const clearFile = useCallback(() => {
        if (isImporting) return;
        readRequestSeqRef.current += 1;
        setState(createInitialImportModalState());
        setIsDragOver(false);
    }, [isImporting]);

    const setPage = useCallback((nextPage: number) => {
        setState((current) => ({
            ...current,
            page: nextPage,
        }));
    }, []);

    const confirmImport = useCallback(async () => {
        if (!canConfirm || !effectiveValidation || !effectiveValidation.valid) {
            return;
        }

        const expectedRoomId = roomId;
        const result = await onImportBatch(effectiveValidation.questions);
        const summary = describeImportOutcome(result);

        setState((current) => {
            if (
                activeRoomIdRef.current !== expectedRoomId &&
                result.status !== 'STALE_ROOM'
            ) {
                return current;
            }

            return {
                ...current,
                outcome: summary,
            };
        });
    }, [canConfirm, effectiveValidation, onImportBatch, roomId]);

    const handleRequestClose = useCallback(() => {
        if (!canCloseImportModal(isImporting)) {
            return;
        }
        onClose();
    }, [isImporting, onClose]);

    return {
        selectedFile: state.selectedFile,
        formattedFileSize: state.selectedFile
            ? formatImportFileSize(state.selectedFile.size)
            : null,
        isReadingFile: state.isReadingFile,
        readError: state.readError,
        validation: effectiveValidation,
        pagination,
        outcome: state.outcome,
        isDragOver,
        setIsDragOver,
        isImporting,
        isRoomEditable,
        canConfirm,
        canClose: canCloseImportModal(isImporting),
        selectFile,
        clearFile,
        setPage,
        confirmImport,
        handleRequestClose,
    };
}
