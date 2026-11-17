import { useState } from 'react';
import './DashboardForm.css';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../../components/ui/ConfirmDialog/ConfirmDialog';
import Logo from '../../../components/ui/Logo/Logo';
import { DEMO_ROOM_PIN } from '../../../models/game';
import { QUESTION_TYPE_LABEL } from '../../../models/question';
import { ROOM_TIME_OPTIONS, formatRoomCode } from '../../../models/room';
import { useQuestionBankViewModel } from '../../../viewmodels/useQuestionBankViewModel';
import { useRoomsViewModel } from '../../../viewmodels/useRoomsViewModel';
import QuestionFormModal from '../../../views/Dashboard/QuestionFormModal/QuestionFormModal';
import RoomCodeModal from '../../../views/Dashboard/RoomCodeModal/RoomCodeModal';
import RoomReportModal from '../../../views/Dashboard/RoomReportModal/RoomReportModal';
import ProfileModal from '../../../views/Dashboard/ProfileModal/ProfileModal';
import { useProfileViewModel } from '../../../viewmodels/useProfileViewModel';
import OverviewStats from '../../../views/Dashboard/OverviewStats/OverviewStats';

export default function DashboardForm() {
  const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'questions'>('overview');
  const navigate = useNavigate();
  // Usuário logado e edição do perfil (MVVM: useProfileViewModel)
  const profileVm = useProfileViewModel();

  function handleLogout() {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
  }
  // Salas e perguntas: estado e ações ficam nos ViewModels (MVVM)
  const questionBank = useQuestionBankViewModel();
  const roomsVm = useRoomsViewModel(questionBank.questions);

  return (
    <div className="dashboard-container">
      {/* Menu Lateral */}
      <aside className="dashboard-sidebar">
        <div>
          <div className="sidebar-header">
            <Logo size={36} />
            <p>Painel Administrativo</p>
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
              ❓ Admin de Perguntas
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
            {activeTab === 'rooms' && 'Gerenciamento de Salas'}
            {activeTab === 'questions' && 'Banco de Perguntas'}
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
                  <span>Salas Cadastradas</span>
                  <h3>{roomsVm.rooms.length}</h3>
                </div>
                <div className="stat-card">
                  <span>Perguntas Ativas</span>
                  <h3>{questionBank.activeCount}</h3>
                </div>
                <div className="stat-card">
                  <span>Salas Finalizadas</span>
                  <h3>{roomsVm.rooms.filter(room => room.status === 'Finalizado').length}</h3>
                </div>
              </div>
              <div className="welcome-banner">
                <h2>Bem-vindo ao Painel da Quiz Arena</h2>
                <p>Utilize o menu lateral para configurar salas de jogos em tempo real ou administrar o banco de perguntas do sistema.</p>
              </div>

              {/* Estatísticas dos quizzes realizados (MVVM: useOverviewViewModel) */}
              <OverviewStats
                rooms={roomsVm.rooms}
                questions={questionBank.questions}
                onOpenReport={roomsVm.openReport}
              />
            </>
          )}

          {/* ABA: Salas */}
          {activeTab === 'rooms' && (
            <div>
              <div className="section-header">
                <h2>Salas Disponíveis</h2>
                <button className="primary-btn" onClick={roomsVm.openCreate}>
                  + Criar Nova Sala
                </button>
              </div>

              <div className="rooms-grid">
                {roomsVm.rooms.map(room => (
                  <div className="room-card" key={room.id}>
                    <div className="room-info">
                      <div className="room-info__top">
                        <span className="room-theme">{room.theme}</span>
                        <div className="room-manage">
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => roomsVm.openEdit(room)}
                            aria-label={`Editar sala ${room.name}`}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-icon danger"
                            onClick={() => roomsVm.requestDelete(room)}
                            aria-label={`Excluir sala ${room.name}`}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                      <h3>{room.name}</h3>
                      <p>Tempo por questão: {room.timeLimit}s</p>
                      <p>
                        {room.questionIds.length > 0
                          ? `${room.questionIds.length} ${room.questionIds.length === 1 ? 'pergunta' : 'perguntas'}`
                          : 'Todas as perguntas ativas'}
                      </p>
                    </div>
                    {/* Código gerado automaticamente; clicar abre a tela de projeção */}
                    <button
                      type="button"
                      className="room-code-chip"
                      onClick={() => roomsVm.showCode(room)}
                      aria-label={`Mostrar código da sala ${room.name} para a turma`}
                    >
                      <span className="room-code-chip__label">Código</span>
                      <span className="room-code-chip__value">{formatRoomCode(room.code)}</span>
                      <span className="room-code-chip__action">Mostrar</span>
                    </button>
                    <div>
                      <span className={`status-badge ${
                        room.status === 'Aguardando' ? 'waiting' : 
                        room.status === 'Em Andamento' ? 'active' : 'finished'
                      }`}>
                        {room.status}
                      </span>
                    </div>
                    <div className="room-actions">
                      {room.status === 'Aguardando' && (
                        <button className="action-btn start" onClick={() => roomsVm.updateStatus(room.id, 'Em Andamento')}>
                          Iniciar Jogo
                        </button>
                      )}
                      {room.status === 'Em Andamento' && (
                        <button className="action-btn finish" onClick={() => roomsVm.updateStatus(room.id, 'Finalizado')}>
                          Finalizar
                        </button>
                      )}
                      {room.status === 'Finalizado' && (
                        <button className="action-btn results" onClick={() => roomsVm.openReport(room)}>
                          Ver resultados
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA: Perguntas */}
          {activeTab === 'questions' && (
            <div>
              <div className="section-header">
                <h2>Gerenciar Perguntas</h2>
                <button className="primary-btn" onClick={questionBank.openCreate}>
                  + Cadastrar Pergunta
                </button>
              </div>

              <p className="section-note">
                As perguntas ativas são usadas na sala de demonstração <strong>{DEMO_ROOM_PIN}</strong>,
                disponível para os alunos em <a href="/jogar">/jogar</a>.
              </p>

              <div className="table-container">
                <table className="questions-table">
                  <thead>
                    <tr>
                      <th>Título / Pergunta</th>
                      <th>Tipo</th>
                      <th>Tema</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionBank.questions.map(q => (
                      <tr key={q.id}>
                        <td>{q.statement}</td>
                        <td>
                          {QUESTION_TYPE_LABEL[q.type]}
                          {q.type === 'MULTIPLE_CHOICE' && (
                            <span className="question-type-count"> · {q.options.length} alternativas</span>
                          )}
                        </td>
                        <td>{q.theme}</td>
                        <td>
                          <span className={`status-badge ${q.isActive ? 'active' : 'finished'}`}>
                            {q.isActive ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-icon" onClick={() => questionBank.openEdit(q)}>
                              Editar
                            </button>
                            <button
                              className={`btn-icon toggle ${q.isActive ? 'active' : 'inactive'}`}
                              onClick={() => questionBank.toggleStatus(q.id)}
                            >
                              {q.isActive ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal: Criar Sala */}
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
                  onChange={e => roomsVm.setName(e.target.value)}
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
                  onChange={e => roomsVm.setTheme(e.target.value)}
                  placeholder="Ex: React & TypeScript"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="room-time">Tempo Limite por Questão (segundos)</label>
                <select
                  id="room-time"
                  value={roomsVm.form.timeLimit}
                  onChange={e => roomsVm.setTimeLimit(Number(e.target.value))}
                >
                  {ROOM_TIME_OPTIONS.map(seconds => (
                    <option key={seconds} value={seconds}>{seconds} segundos</option>
                  ))}
                </select>
              </div>
              <fieldset className="room-questions">
                <legend className="room-questions__legend">
                  Perguntas da sala
                  <span className="room-questions__count">
                    {roomsVm.form.selectedQuestionIds.length} de {roomsVm.selectableQuestions.length} selecionadas
                  </span>
                </legend>

                {roomsVm.selectableQuestions.length === 0 ? (
                  <p className="room-questions__empty">
                    Nenhuma pergunta ativa. Cadastre ou ative perguntas na aba "Admin de Perguntas".
                  </p>
                ) : (
                  <>
                    {/* Filtro por tema: vários temas podem ser combinados */}
                    <div className="room-questions__themes" role="group" aria-label="Filtrar perguntas por tema">
                      <button
                        type="button"
                        className={`room-theme-chip${roomsVm.selectedThemes.length === 0 ? ' is-active' : ''}`}
                        aria-pressed={roomsVm.selectedThemes.length === 0}
                        onClick={roomsVm.clearThemes}
                      >
                        Todos
                      </button>
                      {roomsVm.availableThemes.map(themeName => {
                        const isActive = roomsVm.selectedThemes.includes(themeName);
                        return (
                          <button
                            key={themeName}
                            type="button"
                            className={`room-theme-chip${isActive ? ' is-active' : ''}`}
                            aria-pressed={isActive}
                            onClick={() => roomsVm.toggleTheme(themeName)}
                          >
                            {themeName}
                          </button>
                        );
                      })}
                    </div>
                    <div className="room-questions__toolbar">
                      <button type="button" className="room-questions__toggle-all" onClick={roomsVm.toggleAllQuestions}>
                        {roomsVm.allVisibleSelected
                          ? (roomsVm.selectedThemes.length > 0 ? 'Desmarcar as dos temas escolhidos' : 'Desmarcar todas')
                          : (roomsVm.selectedThemes.length > 0 ? 'Selecionar as dos temas escolhidos' : 'Selecionar todas')}
                      </button>
                    </div>
                    <ul className="room-questions__list">
                      {roomsVm.visibleQuestions.map(question => {
                        const order = roomsVm.form.selectedQuestionIds.indexOf(question.id);
                        const isSelected = order !== -1;
                        return (
                          <li key={question.id}>
                            <label className={`room-questions__item${isSelected ? ' is-selected' : ''}`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => roomsVm.toggleQuestion(question.id)}
                              />
                              <span className="room-questions__text">
                                <span className="room-questions__statement">{question.statement}</span>
                                <span className="room-questions__meta">
                                  {QUESTION_TYPE_LABEL[question.type]} · {question.theme}
                                </span>
                              </span>
                              {/* Ordem em que a pergunta será jogada */}
                              {isSelected && (
                                <span className="room-questions__order" aria-label={`${order + 1}ª pergunta`}>
                                  {order + 1}
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </fieldset>

              {roomsVm.formError && (
                <p className="room-form-error" role="alert">{roomsVm.formError}</p>
              )}

              <p className="room-form-note">
                {roomsVm.editingRoom
                  ? <>O código da sala continua o mesmo: <strong>{formatRoomCode(roomsVm.editingRoom.code)}</strong>.</>
                  : 'O código da sala é gerado automaticamente e aparece assim que a sala for criada.'}
              </p>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={roomsVm.closeCreate}>Cancelar</button>
                <button type="submit" className="primary-btn">
                  {roomsVm.isEditing ? 'Salvar alterações' : 'Criar sala'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tela de exibição do código da sala (para projetar aos alunos) */}
      <RoomCodeModal room={roomsVm.displayedRoom} onClose={roomsVm.hideCode} />

      {/* Perfil do usuário (aberto pelo nome no topo) */}
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

      {/* Confirmação antes de excluir uma sala (ação sem desfazer) */}
      <ConfirmDialog
        isOpen={roomsVm.roomPendingDeletion !== null}
        title="Excluir sala?"
        confirmLabel="Excluir sala"
        tone="danger"
        onConfirm={roomsVm.confirmDelete}
        onCancel={roomsVm.cancelDelete}
      >
        <p>
          A sala <strong>{roomsVm.roomPendingDeletion?.name}</strong> será excluída e o código{' '}
          <strong>{roomsVm.roomPendingDeletion && formatRoomCode(roomsVm.roomPendingDeletion.code)}</strong>{' '}
          deixará de funcionar.
        </p>
        <p>As perguntas do banco não são afetadas. Esta ação não pode ser desfeita.</p>
      </ConfirmDialog>

      {/* Modal: Cadastrar / Editar Pergunta (com alternativas) */}
      <QuestionFormModal
        isOpen={questionBank.isFormOpen}
        question={questionBank.editingQuestion}
        onClose={questionBank.closeForm}
        onSave={questionBank.saveQuestion}
      />
    </div>
  );
}