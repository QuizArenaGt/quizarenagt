import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createId, isPlayable, type Question } from '../models/question';
import { MIN_ROOM_QUESTIONS, generateRoomCode, type Room, type RoomStatus } from '../models/room';
import { buildRoomReport, type RoomReport } from '../models/roomReport';
import { deleteRoomResults, loadRoomResults } from '../services/roomResultsService';
import { loadRooms, saveRooms } from '../services/roomStorageService';

const DEFAULT_THEME = 'Tecnologia';
const DEFAULT_TIME_LIMIT = 30;

/*
 * VIEWMODEL das salas (aba "Salas de Quiz" do painel do professor).
 *
 * Responsabilidades:
 *  - manter a lista de salas e salvá-la (roomStorageService);
 *  - controlar o formulário de criação/edição, incluindo a seleção das
 *    perguntas que farão parte da sala;
 *  - excluir salas, sempre após confirmação do professor;
 *  - abrir o relatório de resultados das salas finalizadas;
 *  - gerar automaticamente o código da sala (regra no Model);
 *  - controlar a tela de exibição do código, aberta logo após criar a
 *    sala para o professor projetar para a turma.
 *
 * Recebe o banco de perguntas como parâmetro (vindo do
 * useQuestionBankViewModel) para não duplicar a fonte dos dados.
 */
export function useRoomsViewModel(questionBank: Question[]) {
    const [rooms, setRooms] = useState<Room[]>(() => loadRooms());

    // Formulário de criação/edição (o mesmo formulário serve aos dois casos)
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [name, setName] = useState('');
    const [theme, setTheme] = useState(DEFAULT_THEME);
    const [timeLimit, setTimeLimit] = useState(DEFAULT_TIME_LIMIT);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    /** Temas usados para filtrar a lista de perguntas (vazio = todos os temas). */
    const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

    // Sala cujo código está sendo exibido em destaque
    const [displayedRoom, setDisplayedRoom] = useState<Room | null>(null);

    // Sala aguardando confirmação de exclusão
    const [roomPendingDeletion, setRoomPendingDeletion] = useState<Room | null>(null);

    // Relatório aberto (sala finalizada + números calculados no momento)
    const [reportView, setReportView] = useState<{ room: Room; report: RoomReport | null } | null>(null);

    useEffect(() => {
        saveRooms(rooms);
    }, [rooms]);

    /** Só perguntas ativas e com resposta correta definida podem entrar na sala. */
    const selectableQuestions = useMemo(
        () => questionBank.filter((question) => question.isActive && isPlayable(question)),
        [questionBank],
    );

    /** Temas existentes entre as perguntas selecionáveis, em ordem alfabética. */
    const availableThemes = useMemo(
        () =>
            [...new Set(selectableQuestions.map((question) => question.theme))].sort((a, b) =>
                a.localeCompare(b, 'pt-BR'),
            ),
        [selectableQuestions],
    );

    /** Perguntas exibidas na lista conforme os temas escolhidos no filtro. */
    const visibleQuestions = useMemo(
        () =>
            selectedThemes.length > 0
                ? selectableQuestions.filter((question) => selectedThemes.includes(question.theme))
                : selectableQuestions,
        [selectableQuestions, selectedThemes],
    );

    /** Liga/desliga um tema no filtro; vários temas podem ser combinados. */
    function toggleTheme(theme: string) {
        setSelectedThemes((current) =>
            current.includes(theme) ? current.filter((item) => item !== theme) : [...current, theme],
        );
    }

    const clearThemes = useCallback(() => setSelectedThemes([]), []);

    const openCreate = useCallback(() => {
        setEditingRoom(null);
        setName('');
        setTheme(DEFAULT_THEME);
        setTimeLimit(DEFAULT_TIME_LIMIT);
        setSelectedQuestionIds([]);
        setFormError(null);
        setSelectedThemes([]);
        setIsCreateOpen(true);
    }, []);

    /** Abre o formulário preenchido com os dados da sala. */
    function openEdit(room: Room) {
        const selectableIds = selectableQuestions.map((question) => question.id);
        // Mantém apenas perguntas que ainda podem ser escolhidas (ativas).
        // Salas antigas, sem lista própria, usavam todas as ativas.
        const selectedIds =
            room.questionIds.length > 0
                ? room.questionIds.filter((id) => selectableIds.includes(id))
                : selectableIds;

        setEditingRoom(room);
        setName(room.name);
        setTheme(room.theme);
        setTimeLimit(room.timeLimit);
        setSelectedQuestionIds(selectedIds);
        setFormError(null);
        setSelectedThemes([]);
        setIsCreateOpen(true);
    }

    const closeCreate = useCallback(() => setIsCreateOpen(false), []);

    /** Marca/desmarca uma pergunta, mantendo a ordem em que foram escolhidas. */
    function toggleQuestion(id: string) {
        setSelectedQuestionIds((current) =>
            current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
        );
        setFormError(null);
    }

    const allVisibleSelected =
        visibleQuestions.length > 0 &&
        visibleQuestions.every((question) => selectedQuestionIds.includes(question.id));

    /**
     * Marca ou desmarca todas as perguntas VISÍVEIS (respeitando os temas
     * escolhidos no filtro). Perguntas de outros temas já escolhidas não são afetadas.
     */
    function toggleAllQuestions() {
        const visibleIds = visibleQuestions.map((question) => question.id);
        setSelectedQuestionIds((current) =>
            allVisibleSelected
                ? current.filter((id) => !visibleIds.includes(id))
                : [...current, ...visibleIds.filter((id) => !current.includes(id))],
        );
        setFormError(null);
    }

    /** Envio do formulário: cria uma sala nova ou salva a edição. */
    function submitRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!name.trim()) {
            setFormError('Dê um nome para a sala.');
            return;
        }
        if (selectedQuestionIds.length < MIN_ROOM_QUESTIONS) {
            setFormError('Selecione pelo menos uma pergunta para a sala.');
            return;
        }

        const details = {
            name: name.trim(),
            theme: theme.trim() || DEFAULT_THEME,
            timeLimit,
            questionIds: selectedQuestionIds,
        };

        if (editingRoom) {
            // Edição: o código e o status são mantidos, para não invalidar o
            // código que o professor já mostrou à turma.
            setRooms((current) =>
                current.map((room) => (room.id === editingRoom.id ? { ...room, ...details } : room)),
            );
            setIsCreateOpen(false);
            return;
        }

        const room: Room = {
            ...details,
            id: createId(),
            status: 'Aguardando',
            code: generateRoomCode(rooms.map((existing) => existing.code)),
        };

        setRooms((current) => [...current, room]);
        setIsCreateOpen(false);
        // Mostra o código imediatamente, pronto para ser projetado.
        setDisplayedRoom(room);
    }

    const updateStatus = useCallback((id: string, status: RoomStatus) => {
        setRooms((current) => current.map((room) => (room.id === id ? { ...room, status } : room)));
    }, []);

    // ===== Exclusão (sempre com confirmação) =====

    const requestDelete = useCallback((room: Room) => setRoomPendingDeletion(room), []);
    const cancelDelete = useCallback(() => setRoomPendingDeletion(null), []);

    function confirmDelete() {
        if (!roomPendingDeletion) return;
        const deletedId = roomPendingDeletion.id;
        setRooms((current) => current.filter((room) => room.id !== deletedId));
        setDisplayedRoom((current) => (current?.id === deletedId ? null : current));
        deleteRoomResults(deletedId);
        setRoomPendingDeletion(null);
    }

    // ===== Relatório da sala finalizada =====

    /** Calcula o relatório com os resultados registrados até agora. */
    function openReport(room: Room) {
        setReportView({ room, report: buildRoomReport(loadRoomResults(room.id), questionBank) });
    }

    const closeReport = useCallback(() => setReportView(null), []);

    const showCode = useCallback((room: Room) => setDisplayedRoom(room), []);
    const hideCode = useCallback(() => setDisplayedRoom(null), []);

    return {
        rooms,
        isCreateOpen,
        form: { name, theme, timeLimit, selectedQuestionIds },
        formError,
        selectableQuestions,
        visibleQuestions,
        availableThemes,
        selectedThemes,
        toggleTheme,
        clearThemes,
        allVisibleSelected,
        setName: (value: string) => {
            setName(value);
            setFormError(null);
        },
        setTheme,
        setTimeLimit,
        toggleQuestion,
        toggleAllQuestions,
        openCreate,
        openEdit,
        closeCreate,
        isEditing: editingRoom !== null,
        editingRoom,
        submitRoom,
        updateStatus,
        roomPendingDeletion,
        requestDelete,
        cancelDelete,
        confirmDelete,
        reportView,
        openReport,
        closeReport,
        displayedRoom,
        showCode,
        hideCode,
    };
}
