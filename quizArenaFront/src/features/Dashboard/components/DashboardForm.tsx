import { useState } from 'react';
import './DashboardForm.css';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../../components/ui/ConfirmDialog/ConfirmDialog';
import Logo from '../../../components/ui/Logo/Logo';
import { CHOICE_LETTERS, QUESTION_TYPE_LABEL } from '../../../models/question';
import {
    GAME_MODE_LABEL,
    MIN_ROOM_PLAYERS,
    MIN_ROOM_QUESTIONS,
    ROOM_TIME_OPTIONS,
    formatRoomCode,
} from '../../../models/room';
import { useQuestionBankViewModel } from '../../../viewmodels/useQuestionBankViewModel';
import { useRoomsViewModel } from '../../../viewmodels/useRoomsViewModel';
import QuestionFormModal from '../../../views/Dashboard/QuestionFormModal/QuestionFormModal';
import RoomCodeModal from '../../../views/Dashboard/RoomCodeModal/RoomCodeModal';
import RoomReportModal from '../../../views/Dashboard/RoomReportModal/RoomReportModal';
import ProfileModal from '../../../views/Dashboard/ProfileModal/ProfileModal';
import { useProfileViewModel } from '../../../viewmodels/useProfileViewModel';
import OverviewStats from '../../../views/Dashboard/OverviewStats/OverviewStats';
import type { GameMode } from '../../../services/socket';

export default function DashboardForm() {
    const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'questions'>('rooms');
    const navigate = useNavigate();

    const profileVm = useProfileViewModel();
    const roomsVm = useRoomsViewModel();
    const questionBank = useQuestionBankViewModel(roomsVm.activeRoom?.id ?? null);

    function handleLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    }

    const activeRoom = roomsVm.activeRoom;
    const canStartMatch =
        activeRoom !== null &&
        activeRoom.backendStatus === 'WAITING' &&
        activeRoom.players.length >= MIN_ROOM_PLAYERS &&
        questionBank.activeCount >= MIN_ROOM_QUESTIONS;

    return (
        <div className="dashboard-container">
            {/* Menu Lateral */}
            <aside className="dashboard-sidebar">
                <div>
                    <div className="sidebar-header">
                        <Logo size={36} />
                        <p>Painel do Anfitrião</p>
                    </div>
                    <nav className="sidebar-nav">
                        <button
                            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
                            onClick={() => setActiveTab('overview')}
                        >
                            📊 Visão Geral
                        </button>
                        <button
                            className={`nav-item ${activeTab === 'rooms' ? 'active' : ''}`}
                            onClick={() => setActiveTab('rooms')}
                        >
                            🎮 Salas de Quiz
                        </button>
                        <button
                            className={`nav-item ${activeTab === 'questions' ? 'active' : ''}`}
                            onClick={() => setActiveTab('questions')}
                        >
                            ❓ Perguntas da Sala
                        </button>
                    </nav>
                </div>
                <div className="sidebar-footer">
                    <button className="logout-btn" onClick={handleLogout}>
                        Sair da Conta
                    </button>
                </div>
            </aside>

            {/* Conteúdo Principal */}
            <main className="dashboard-main">
                <header className="main-header">
                    <h1>
                        {activeTab === 'overview' && 'Visão Geral do Sistema'}
                        {activeTab === 'rooms' && 'Gerenciamento de Salas e Partida'}
                        {activeTab === 'questions' && 'Perguntas da Sala'}
                    </h1>
                    <button
                        type="button"
                        className="user-profile"
                        onClick={profileVm.open}
                        aria-label={`Abrir perfil de ${profileVm.displayName}`}
                        disabled={!profileVm.profile}
                    >
                        {profileVm.displayName} - {profileVm.roleLabel}
                    </button>
                </header>

                <div className="main-content">
                    {/* ABA: Visão Geral */}
                    {activeTab === 'overview' && (
                        <>
                            <div className="overview-grid">
                                <div className="stat-card">
                                    <span>Salas na Sessão</span>
                                    <h3>{roomsVm.rooms.length}</h3>
                                </div>
                                <div className="stat-card">
                                    <span>Perguntas na Sala Ativa</span>
                                    <h3>{questionBank.activeCount}</h3>
                                </div>
                                <div className="stat-card">
                                    <span>Salas Finalizadas</span>
                                    <h3>
                                        {roomsVm.rooms.filter((room) => room.status === 'Finalizado').length}
                                    </h3>
                                </div>
                            </div>
                            <div className="welcome-banner">
                                <h2>Bem-vindo ao Painel da Quiz Arena</h2>
                                <p>
                                    Crie uma sala, cadastre pelo menos {MIN_ROOM_QUESTIONS} perguntas, compartilhe o
                                    código com os jogadores e conduza a partida em tempo real.
                                </p>
                            </div>

                            <OverviewStats
                                rooms={roomsVm.rooms}
                                questions={questionBank.questions}
                                onOpenReport={(room) => roomsVm.openReport(room, questionBank.questions)}
                            />
                        </>
                    )}

                    {/* ABA: Salas */}
                    {activeTab === 'rooms' && (
                        <div>
                            <div className="section-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
                                <h2>Salas de Quiz</h2>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <form
                                        onSubmit={roomsVm.handleLookupRoom}
                                        style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                                    >
                                        <input
                                            type="text"
                                            value={roomsVm.lookupCode}
                                            onChange={(e) => roomsVm.setLookupCode(e.target.value)}
                                            placeholder="Abrir por código (ex: A1B2C3)"
                                            maxLength={6}
                                            style={{
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid #cbd5e1',
                                                fontSize: '0.9rem',
                                                width: '210px',
                                            }}
                                        />
                                        <button
                                            type="submit"
                                            className="secondary-btn"
                                            disabled={roomsVm.isLoadingRoom || roomsVm.lookupCode.length !== 6}
                                        >
                                            {roomsVm.isLoadingRoom ? 'Buscando…' : 'Carregar Sala'}
                                        </button>
                                    </form>
                                    <button className="primary-btn" onClick={roomsVm.openCreate}>
                                        + Criar Nova Sala
                                    </button>
                                </div>
                            </div>

                            {roomsVm.roomActionError && (
                                <p className="room-form-error" role="alert" style={{ marginBottom: '16px' }}>
                                    {roomsVm.roomActionError}
                                </p>
                            )}

                            {roomsVm.rooms.length === 0 ? (
                                <div className="welcome-banner" style={{ marginBottom: '24px' }}>
                                    <h2>Nenhuma sala aberta</h2>
                                    <p>
                                        Clique em <strong>+ Criar Nova Sala</strong> para gerar um código no servidor,
                                        ou carregue uma sala existente informando seu código de 6 caracteres.
                                    </p>
                                </div>
                            ) : (
                                <div className="rooms-grid" style={{ marginBottom: '28px' }}>
                                    {roomsVm.rooms.map((room) => {
                                        const isSelected = activeRoom?.id === room.id;
                                        return (
                                            <div
                                                className="room-card"
                                                key={room.id}
                                                onClick={() => roomsVm.selectRoom(room)}
                                                style={{
                                                    cursor: 'pointer',
                                                    outline: isSelected ? '2px solid #2563eb' : undefined,
                                                }}
                                            >
                                                <div className="room-info">
                                                    <div className="room-info__top">
                                                        <span className="room-theme">
                                                            {room.theme} · {room.gameMode}
                                                        </span>
                                                        <div
                                                            className="room-manage"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {room.backendStatus === 'WAITING' && (
                                                                <button
                                                                    type="button"
                                                                    className="btn-icon"
                                                                    onClick={() => roomsVm.openEdit(room)}
                                                                    aria-label={`Editar sala ${room.name}`}
                                                                >
                                                                    Editar
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="btn-icon danger"
                                                                onClick={() => roomsVm.requestDelete(room)}
                                                                aria-label={`Remover sala ${room.name}`}
                                                            >
                                                                Remover
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <h3>{room.name}</h3>
                                                    <p>
                                                        Tempo por questão: {room.timeLimit}s · Máx: {room.maxPlayers}{' '}
                                                        jogadores
                                                    </p>
                                                    <p>
                                                        Jogadores no lobby: <strong>{room.players.length}</strong>
                                                        {isSelected && (
                                                            <>
                                                                {' '}
                                                                · Perguntas ativas:{' '}
                                                                <strong>{questionBank.activeCount}</strong>
                                                            </>
                                                        )}
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    className="room-code-chip"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        roomsVm.showCode(room);
                                                    }}
                                                    aria-label={`Mostrar código da sala ${room.name} para a turma`}
                                                >
                                                    <span className="room-code-chip__label">Código</span>
                                                    <span className="room-code-chip__value">
                                                        {formatRoomCode(room.code)}
                                                    </span>
                                                    <span className="room-code-chip__action">Projetar</span>
                                                </button>

                                                <div>
                                                    <span
                                                        className={`status-badge ${
                                                            room.status === 'Aguardando'
                                                                ? 'waiting'
                                                                : room.status === 'Em Andamento'
                                                                  ? 'active'
                                                                  : 'finished'
                                                        }`}
                                                    >
                                                        {room.status}
                                                    </span>
                                                </div>

                                                <div className="room-actions" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        className="action-btn start"
                                                        onClick={() => roomsVm.selectRoom(room)}
                                                    >
                                                        {isSelected ? 'Sala Selecionada' : 'Gerenciar Sala'}
                                                    </button>
                                                    {room.status === 'Finalizado' && (
                                                        <button
                                                            type="button"
                                                            className="action-btn results"
                                                            onClick={() =>
                                                                roomsVm.openReport(room, questionBank.questions)
                                                            }
                                                        >
                                                            Ver resultados
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* PAINEL DETALHADO DA SALA SELECIONADA (Perguntas + Lobby + Partida em Tempo Real) */}
                            {activeRoom && (
                                <section
                                    aria-label={`Painel da sala ${activeRoom.name}`}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '16px',
                                        padding: '24px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '24px',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '12px',
                                            borderBottom: '1px solid #e2e8f0',
                                            paddingBottom: '16px',
                                        }}
                                    >
                                        <div>
                                            <h2 style={{ margin: 0 }}>
                                                {activeRoom.name} — Código:{' '}
                                                <strong style={{ color: '#2563eb', letterSpacing: '1px' }}>
                                                    {activeRoom.code}
                                                </strong>
                                            </h2>
                                            <p style={{ margin: '4px 0 0', color: '#475569' }}>
                                                Status: <strong>{activeRoom.status}</strong> · Modo:{' '}
                                                <strong>{GAME_MODE_LABEL[activeRoom.gameMode]}</strong> · Tempo por
                                                pergunta: <strong>{activeRoom.timeLimit}s</strong>
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="secondary-btn"
                                                onClick={() => void roomsVm.refreshActiveRoomLobby()}
                                            >
                                                Atualizar Lobby
                                            </button>
                                            <button
                                                type="button"
                                                className="secondary-btn"
                                                onClick={() => roomsVm.showCode(activeRoom)}
                                            >
                                                Projetar Código ({formatRoomCode(activeRoom.code)})
                                            </button>
                                        </div>
                                    </div>

                                    {/* BLOCO 1: LOBBY E CONTROLE DA PARTIDA */}
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                            gap: '20px',
                                        }}
                                    >
                                        {/* Jogadores em tempo real */}
                                        <div
                                            style={{
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                padding: '16px',
                                            }}
                                        >
                                            <h3 style={{ marginTop: 0 }}>
                                                Jogadores na Sala ({activeRoom.players.length} /{' '}
                                                {activeRoom.maxPlayers})
                                            </h3>
                                            {activeRoom.players.length === 0 ? (
                                                <p style={{ color: '#64748b' }}>
                                                    Aguardando jogadores entrarem em <strong>/jogar</strong> com o
                                                    código <strong>{activeRoom.code}</strong>…
                                                </p>
                                            ) : (
                                                <ol style={{ margin: 0, paddingLeft: '20px' }}>
                                                    {[...activeRoom.players]
                                                        .sort((a, b) => b.score - a.score)
                                                        .map((player) => (
                                                            <li
                                                                key={player.id}
                                                                style={{
                                                                    padding: '6px 0',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    borderBottom: '1px solid #e2e8f0',
                                                                }}
                                                            >
                                                                <strong>{player.nickname}</strong>
                                                                <span>{player.score} pts</span>
                                                            </li>
                                                        ))}
                                                </ol>
                                            )}
                                        </div>

                                        {/* Controle de início e rodadas */}
                                        <div
                                            style={{
                                                background: '#f8fafc',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '12px',
                                                padding: '16px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between',
                                                gap: '12px',
                                            }}
                                        >
                                            {activeRoom.backendStatus === 'WAITING' && (
                                                <>
                                                    <div>
                                                        <h3 style={{ marginTop: 0 }}>Requisitos para Iniciar</h3>
                                                        <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.7 }}>
                                                            <li
                                                                style={{
                                                                    color:
                                                                        questionBank.activeCount >= MIN_ROOM_QUESTIONS
                                                                            ? '#15803d'
                                                                            : '#b45309',
                                                                }}
                                                            >
                                                                Perguntas na sala:{' '}
                                                                <strong>
                                                                    {questionBank.activeCount} / mín.{' '}
                                                                    {MIN_ROOM_QUESTIONS}
                                                                </strong>{' '}
                                                                {questionBank.activeCount >= MIN_ROOM_QUESTIONS
                                                                    ? '✓'
                                                                    : '(cadastre abaixo)'}
                                                            </li>
                                                            <li
                                                                style={{
                                                                    color:
                                                                        activeRoom.players.length >= MIN_ROOM_PLAYERS
                                                                            ? '#15803d'
                                                                            : '#b45309',
                                                                }}
                                                            >
                                                                Jogadores conectados:{' '}
                                                                <strong>
                                                                    {activeRoom.players.length} / mín.{' '}
                                                                    {MIN_ROOM_PLAYERS}
                                                                </strong>{' '}
                                                                {activeRoom.players.length >= MIN_ROOM_PLAYERS
                                                                    ? '✓'
                                                                    : '(aguardando jogadores)'}
                                                            </li>
                                                        </ul>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="primary-btn"
                                                        disabled={!canStartMatch || roomsVm.isStartingMatch}
                                                        onClick={() => void roomsVm.startMatch(activeRoom)}
                                                        style={{ width: '100%', padding: '12px' }}
                                                    >
                                                        {roomsVm.isStartingMatch
                                                            ? 'Iniciando Partida…'
                                                            : '🚀 Iniciar Partida'}
                                                    </button>
                                                </>
                                            )}

                                            {activeRoom.backendStatus === 'IN_PROGRESS' && (
                                                <>
                                                    {roomsVm.activeRound ? (
                                                        <div>
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    marginBottom: '8px',
                                                                }}
                                                            >
                                                                <strong>
                                                                    Rodada {roomsVm.activeRound.roundNumber} em
                                                                    andamento
                                                                </strong>
                                                                <span
                                                                    className="status-badge active"
                                                                    style={{ fontSize: '1rem' }}
                                                                >
                                                                    ⏱ {roomsVm.roundRemainingSeconds}s
                                                                </span>
                                                            </div>
                                                            <p
                                                                style={{
                                                                    fontSize: '1.05rem',
                                                                    fontWeight: 600,
                                                                    margin: '8px 0',
                                                                }}
                                                            >
                                                                {roomsVm.activeRound.question.statement}
                                                            </p>
                                                            <p style={{ color: '#475569', margin: '8px 0' }}>
                                                                Respostas recebidas:{' '}
                                                                <strong>
                                                                    {roomsVm.answeredPlayers.length} de{' '}
                                                                    {activeRoom.players.length}
                                                                </strong>
                                                                {roomsVm.answeredPlayers.length > 0 && (
                                                                    <>
                                                                        {' '}
                                                                        (
                                                                        {roomsVm.answeredPlayers
                                                                            .map((p) => p.nickname)
                                                                            .join(', ')}
                                                                        )
                                                                    </>
                                                                )}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                className="secondary-btn"
                                                                onClick={() => void roomsVm.closeCurrentRound()}
                                                                disabled={
                                                                    roomsVm.roundRemainingSeconds > 0 &&
                                                                    roomsVm.answeredPlayers.length <
                                                                        activeRoom.players.length
                                                                }
                                                                style={{ width: '100%', marginTop: '8px' }}
                                                            >
                                                                Encerrar Rodada
                                                            </button>
                                                        </div>
                                                    ) : roomsVm.closedRound ? (
                                                        <div>
                                                            <h3 style={{ marginTop: 0 }}>
                                                                Rodada {roomsVm.closedRound.roundNumber} Encerrada
                                                            </h3>
                                                            <p style={{ margin: '6px 0' }}>
                                                                Pergunta:{' '}
                                                                <strong>
                                                                    {roomsVm.closedRound.question.statement}
                                                                </strong>
                                                            </p>
                                                            <p style={{ margin: '6px 0', color: '#15803d' }}>
                                                                Resposta Correta:{' '}
                                                                <strong>
                                                                    {
                                                                        roomsVm.closedRound.question.options.find(
                                                                            (o) => o.isCorrect,
                                                                        )?.text
                                                                    }
                                                                </strong>
                                                            </p>
                                                            <button
                                                                type="button"
                                                                className="primary-btn"
                                                                disabled={roomsVm.isAdvancingRound}
                                                                onClick={() => void roomsVm.advanceToNextRound()}
                                                                style={{ width: '100%', marginTop: '12px' }}
                                                            >
                                                                {roomsVm.isAdvancingRound
                                                                    ? 'Avançando…'
                                                                    : '▶ Próxima Rodada / Finalizar Partida'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <p>Partida iniciada. Abra a próxima rodada:</p>
                                                            <button
                                                                type="button"
                                                                className="primary-btn"
                                                                disabled={roomsVm.isAdvancingRound}
                                                                onClick={() => void roomsVm.advanceToNextRound()}
                                                            >
                                                                Abrir Próxima Rodada
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {activeRoom.backendStatus === 'FINISHED' && (
                                                <div>
                                                    <h3 style={{ marginTop: 0, color: '#15803d' }}>
                                                        🏁 Partida Finalizada!
                                                    </h3>
                                                    <p>
                                                        Todas as rodadas foram concluídas e a pontuação final está
                                                        consolidada no placar ao lado.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className="primary-btn"
                                                        onClick={() =>
                                                            roomsVm.openReport(activeRoom, questionBank.questions)
                                                        }
                                                    >
                                                        Ver Relatório Completo da Partida
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* BLOCO 2: PERGUNTAS VINCULADAS A ESTA SALA */}
                                    <div>
                                        <div className="section-header" style={{ marginBottom: '12px' }}>
                                            <div>
                                                <h3 style={{ margin: 0 }}>
                                                    Perguntas desta Sala ({questionBank.questions.length})
                                                </h3>
                                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                                                    São necessárias pelo menos {MIN_ROOM_QUESTIONS} perguntas para
                                                    iniciar a partida.
                                                </p>
                                            </div>
                                            {activeRoom.backendStatus === 'WAITING' && (
                                                <button className="primary-btn" onClick={questionBank.openCreate}>
                                                    + Cadastrar Pergunta na Sala
                                                </button>
                                            )}
                                        </div>

                                        {questionBank.error && (
                                            <p className="room-form-error" role="alert">
                                                {questionBank.error}
                                            </p>
                                        )}

                                        {questionBank.isLoading ? (
                                            <p>Carregando perguntas da sala…</p>
                                        ) : questionBank.questions.length === 0 ? (
                                            <p style={{ color: '#64748b' }}>
                                                Nenhuma pergunta cadastrada nesta sala ainda. Clique em{' '}
                                                <strong>+ Cadastrar Pergunta na Sala</strong> para adicionar as{' '}
                                                {MIN_ROOM_QUESTIONS} perguntas.
                                            </p>
                                        ) : (
                                            <div className="table-container">
                                                <table className="questions-table">
                                                    <thead>
                                                        <tr>
                                                            <th>#</th>
                                                            <th>Enunciado da Pergunta</th>
                                                            <th>Tipo</th>
                                                            <th>Alternativas</th>
                                                            {activeRoom.backendStatus === 'WAITING' && <th>Ações</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {questionBank.questions.map((q, index) => (
                                                            <tr key={q.id}>
                                                                <td>{index + 1}</td>
                                                                <td>{q.statement}</td>
                                                                <td>{QUESTION_TYPE_LABEL[q.type]}</td>
                                                                <td>
                                                                    {q.options.map((opt, optIdx) => (
                                                                        <span
                                                                            key={opt.id}
                                                                            style={{
                                                                                display: 'inline-block',
                                                                                marginRight: '8px',
                                                                                fontWeight: opt.isCorrect ? 700 : 400,
                                                                                color: opt.isCorrect
                                                                                    ? '#15803d'
                                                                                    : undefined,
                                                                            }}
                                                                        >
                                                                            {CHOICE_LETTERS[optIdx]}: {opt.text}
                                                                            {opt.isCorrect ? ' ✓' : ''}
                                                                        </span>
                                                                    ))}
                                                                </td>
                                                                {activeRoom.backendStatus === 'WAITING' && (
                                                                    <td>
                                                                        <div className="table-actions">
                                                                            <button
                                                                                type="button"
                                                                                className="btn-icon"
                                                                                onClick={() => questionBank.openEdit(q)}
                                                                            >
                                                                                Editar
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                className="btn-icon danger"
                                                                                onClick={() =>
                                                                                    void questionBank.deleteQuestion(
                                                                                        q.id,
                                                                                    )
                                                                                }
                                                                            >
                                                                                Excluir
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}

                    {/* ABA: Perguntas */}
                    {activeTab === 'questions' && (
                        <div>
                            <div className="section-header">
                                <h2>
                                    {activeRoom
                                        ? `Perguntas da Sala: ${activeRoom.name} (${activeRoom.code})`
                                        : 'Gerenciar Perguntas da Sala'}
                                </h2>
                                {activeRoom && activeRoom.backendStatus === 'WAITING' && (
                                    <button className="primary-btn" onClick={questionBank.openCreate}>
                                        + Cadastrar Pergunta
                                    </button>
                                )}
                            </div>

                            {!activeRoom ? (
                                <div className="welcome-banner">
                                    <h2>Selecione ou crie uma sala primeiro</h2>
                                    <p>
                                        No QuizArena, as perguntas são vinculadas a uma sala. Vá até a aba{' '}
                                        <strong>Salas de Quiz</strong> e crie uma sala para cadastrar suas perguntas.
                                    </p>
                                    <button
                                        type="button"
                                        className="primary-btn"
                                        onClick={() => {
                                            setActiveTab('rooms');
                                            roomsVm.openCreate();
                                        }}
                                        style={{ marginTop: '12px' }}
                                    >
                                        + Criar Nova Sala
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <p className="section-note">
                                        Sala ativa: <strong>{activeRoom.name}</strong> (código{' '}
                                        <strong>{activeRoom.code}</strong>) ·{' '}
                                        <strong>{questionBank.activeCount}</strong> de no mínimo{' '}
                                        <strong>{MIN_ROOM_QUESTIONS}</strong> perguntas cadastradas.
                                    </p>

                                    {questionBank.error && (
                                        <p className="room-form-error" role="alert">
                                            {questionBank.error}
                                        </p>
                                    )}

                                    <div className="table-container">
                                        <table className="questions-table">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Título / Pergunta</th>
                                                    <th>Tipo</th>
                                                    <th>Alternativas</th>
                                                    <th>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {questionBank.questions.map((q, idx) => (
                                                    <tr key={q.id}>
                                                        <td>{idx + 1}</td>
                                                        <td>{q.statement}</td>
                                                        <td>
                                                            {QUESTION_TYPE_LABEL[q.type]}
                                                            {q.type === 'MULTIPLE_CHOICE' && (
                                                                <span className="question-type-count">
                                                                    {' '}
                                                                    · {q.options.length} alternativas
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {q.options.map((opt, optIdx) => (
                                                                <span
                                                                    key={opt.id}
                                                                    style={{
                                                                        display: 'inline-block',
                                                                        marginRight: '8px',
                                                                        fontWeight: opt.isCorrect ? 700 : 400,
                                                                        color: opt.isCorrect ? '#15803d' : undefined,
                                                                    }}
                                                                >
                                                                    {CHOICE_LETTERS[optIdx]}: {opt.text}
                                                                    {opt.isCorrect ? ' ✓' : ''}
                                                                </span>
                                                            ))}
                                                        </td>
                                                        <td>
                                                            {activeRoom.backendStatus === 'WAITING' ? (
                                                                <div className="table-actions">
                                                                    <button
                                                                        className="btn-icon"
                                                                        onClick={() => questionBank.openEdit(q)}
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                    <button
                                                                        className="btn-icon danger"
                                                                        onClick={() =>
                                                                            void questionBank.deleteQuestion(q.id)
                                                                        }
                                                                    >
                                                                        Excluir
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span>Sala iniciada</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Modal: Criar / Editar Sala */}
            {roomsVm.isCreateOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>{roomsVm.isEditing ? 'Editar Sala' : 'Criar e Configurar Nova Sala'}</h3>
                        <form onSubmit={roomsVm.submitRoom}>
                            <div className="form-group">
                                <label htmlFor="room-name">Nome da Sala</label>
                                <input
                                    id="room-name"
                                    type="text"
                                    value={roomsVm.form.name}
                                    onChange={(e) => roomsVm.setName(e.target.value)}
                                    placeholder="Ex: Arena de Programação"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="room-theme">Tema</label>
                                <input
                                    id="room-theme"
                                    type="text"
                                    value={roomsVm.form.theme}
                                    onChange={(e) => roomsVm.setTheme(e.target.value)}
                                    placeholder="Ex: React & TypeScript"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="room-max-players">Máximo de Jogadores (2 a 50)</label>
                                <input
                                    id="room-max-players"
                                    type="number"
                                    min={2}
                                    max={50}
                                    value={roomsVm.form.maxPlayers}
                                    onChange={(e) => roomsVm.setMaxPlayers(Number(e.target.value))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="room-time">Tempo Limite por Questão (segundos)</label>
                                <select
                                    id="room-time"
                                    value={roomsVm.form.timeLimit}
                                    onChange={(e) => roomsVm.setTimeLimit(Number(e.target.value))}
                                >
                                    {ROOM_TIME_OPTIONS.map((seconds) => (
                                        <option key={seconds} value={seconds}>
                                            {seconds} segundos
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="room-mode">Modo de Jogo</label>
                                <select
                                    id="room-mode"
                                    value={roomsVm.form.gameMode}
                                    onChange={(e) => roomsVm.setGameMode(e.target.value as GameMode)}
                                >
                                    {(Object.keys(GAME_MODE_LABEL) as GameMode[]).map((mode) => (
                                        <option key={mode} value={mode}>
                                            {GAME_MODE_LABEL[mode]}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {roomsVm.formError && (
                                <p className="room-form-error" role="alert">
                                    {roomsVm.formError}
                                </p>
                            )}

                            <p className="room-form-note">
                                {roomsVm.editingRoom ? (
                                    <>
                                        O código da sala continua o mesmo:{' '}
                                        <strong>{formatRoomCode(roomsVm.editingRoom.code)}</strong>.
                                    </>
                                ) : (
                                    'Após criar a sala, cadastre pelo menos 5 perguntas dentro dela para iniciar a partida.'
                                )}
                            </p>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={roomsVm.closeCreate}
                                    disabled={roomsVm.isSubmittingRoom}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="primary-btn"
                                    disabled={roomsVm.isSubmittingRoom}
                                >
                                    {roomsVm.isSubmittingRoom
                                        ? 'Salvando…'
                                        : roomsVm.isEditing
                                          ? 'Salvar alterações'
                                          : 'Criar sala'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Tela de exibição do código da sala (para projetar aos alunos) */}
            <RoomCodeModal room={roomsVm.displayedRoom} onClose={roomsVm.hideCode} />

            {/* Perfil do usuário */}
            <ProfileModal
                isOpen={profileVm.isOpen}
                profile={profileVm.profile}
                roleLabel={profileVm.roleLabel}
                license={profileVm.license}
                draft={profileVm.draft}
                errors={profileVm.errors}
                isSaving={profileVm.isSaving}
                savedMessage={profileVm.savedMessage}
                onFieldChange={profileVm.setField}
                onSubmit={profileVm.submit}
                onClose={profileVm.close}
            />

            {/* Relatório da sala finalizada */}
            <RoomReportModal view={roomsVm.reportView} onClose={roomsVm.closeReport} />

            {/* Confirmação antes de remover uma sala da visualização */}
            <ConfirmDialog
                isOpen={roomsVm.roomPendingDeletion !== null}
                title="Remover sala da lista?"
                confirmLabel="Remover"
                tone="danger"
                onConfirm={roomsVm.confirmDelete}
                onCancel={roomsVm.cancelDelete}
            >
                <p>
                    A sala <strong>{roomsVm.roomPendingDeletion?.name}</strong> (código{' '}
                    <strong>
                        {roomsVm.roomPendingDeletion && formatRoomCode(roomsVm.roomPendingDeletion.code)}
                    </strong>
                    ) será removida desta listagem.
                </p>
            </ConfirmDialog>

            {/* Modal: Cadastrar / Editar Pergunta (vinculada à sala ativa) */}
            <QuestionFormModal
                isOpen={questionBank.isFormOpen}
                question={questionBank.editingQuestion}
                onClose={questionBank.closeForm}
                onSave={questionBank.saveQuestion}
            />
        </div>
    );
}
