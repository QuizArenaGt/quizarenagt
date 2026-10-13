import React, { useState } from 'react';
import './DashboardForm.css';

interface Room {
  id: number;
  name: string;
  theme: string;
  timeLimit: number;
  status: 'Aguardando' | 'Em Andamento' | 'Finalizado';
}

interface Question {
  id: number;
  title: string;
  theme: string;
  active: boolean;
}

export default function DashboardForm() {
  const [activeTab, setActiveTab] = useState<'overview' | 'rooms' | 'questions'>('overview');

  // Estados de Salas
  const [rooms, setRooms] = useState<Room[]>([
    { id: 1, name: 'Arena Tech 01', theme: 'Programação & Web', timeLimit: 30, status: 'Aguardando' },
    { id: 2, name: 'Desafio Geek', theme: 'Cultura Pop', timeLimit: 20, status: 'Em Andamento' },
  ]);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTheme, setNewRoomTheme] = useState('Tecnologia');
  const [newRoomTime, setNewRoomTime] = useState(30);

  // Estados de Perguntas
  const [questions, setQuestions] = useState<Question[]>([
    { id: 1, title: 'Qual hook do React é utilizado para gerenciar efeitos colaterais?', theme: 'React', active: true },
    { id: 2, title: 'O que significa a sigla CSS?', theme: 'Web', active: true },
    { id: 3, title: 'Qual banco de dados é estritamente relacional?', theme: 'Banco de Dados', active: false },
  ]);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [qTitle, setQTitle] = useState('');
  const [qTheme, setQTheme] = useState('');

  // Funções de Salas
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const newRoom: Room = {
      id: Date.now(),
      name: newRoomName,
      theme: newRoomTheme,
      timeLimit: Number(newRoomTime),
      status: 'Aguardando',
    };
    setRooms([...rooms, newRoom]);
    setNewRoomName('');
    setIsRoomModalOpen(false);
  };

  const updateRoomStatus = (id: number, status: 'Aguardando' | 'Em Andamento' | 'Finalizado') => {
    setRooms(rooms.map(r => (r.id === id ? { ...r, status } : r)));
  };

  // Funções de Perguntas
  const handleOpenQuestionModal = (question?: Question) => {
    if (question) {
      setEditingQuestion(question);
      setQTitle(question.title);
      setQTheme(question.theme);
    } else {
      setEditingQuestion(null);
      setQTitle('');
      setQTheme('');
    }
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qTitle.trim()) return;

    if (editingQuestion) {
      setQuestions(questions.map(q => q.id === editingQuestion.id ? { ...q, title: qTitle, theme: qTheme } : q));
    } else {
      const newQ: Question = {
        id: Date.now(),
        title: qTitle,
        theme: qTheme || 'Geral',
        active: true,
      };
      setQuestions([...questions, newQ]);
    }
    setIsQuestionModalOpen(false);
  };

  const toggleQuestionStatus = (id: number) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, active: !q.active } : q));
  };

  return (
    <div className="dashboard-container">
      {/* Menu Lateral */}
      <aside className="dashboard-sidebar">
        <div>
          <div className="sidebar-header">
            <div className="sidebar-logo"></div>
            <h2>QUIZ ARENA</h2>
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
          <button className="logout-btn" onClick={() => alert('Saindo do sistema...')}>
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
          <div className="user-profile">Administrador</div>
        </header>

        <div className="main-content">
          {/* ABA: Visão Geral */}
          {activeTab === 'overview' && (
            <>
              <div className="overview-grid">
                <div className="stat-card">
                  <span>Salas Cadastradas</span>
                  <h3>{rooms.length}</h3>
                </div>
                <div className="stat-card">
                  <span>Perguntas Ativas</span>
                  <h3>{questions.filter(q => q.active).length}</h3>
                </div>
                <div className="stat-card">
                  <span>Jogadores Online</span>
                  <h3>42</h3>
                </div>
              </div>
              <div className="welcome-banner">
                <h2>Bem-vindo ao Painel da Quiz Arena</h2>
                <p>Utilize o menu lateral para configurar salas de jogos em tempo real ou administrar o banco de perguntas do sistema.</p>
              </div>
            </>
          )}

          {/* ABA: Salas */}
          {activeTab === 'rooms' && (
            <div>
              <div className="section-header">
                <h2>Salas Disponíveis</h2>
                <button className="primary-btn" onClick={() => setIsRoomModalOpen(true)}>
                  + Criar Nova Sala
                </button>
              </div>

              <div className="rooms-grid">
                {rooms.map(room => (
                  <div className="room-card" key={room.id}>
                    <div className="room-info">
                      <span className="room-theme">{room.theme}</span>
                      <h3>{room.name}</h3>
                      <p>Tempo por questão: {room.timeLimit}s</p>
                    </div>
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
                        <button className="action-btn start" onClick={() => updateRoomStatus(room.id, 'Em Andamento')}>
                          Iniciar Jogo
                        </button>
                      )}
                      {room.status === 'Em Andamento' && (
                        <button className="action-btn finish" onClick={() => updateRoomStatus(room.id, 'Finalizado')}>
                          Finalizar
                        </button>
                      )}
                      {room.status === 'Finalizado' && (
                        <span style={{ fontSize: '0.8rem', color: '#8da4ef', textAlign: 'center', width: '100%' }}>Encerrado</span>
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
                <button className="primary-btn" onClick={() => handleOpenQuestionModal()}>
                  + Cadastrar Pergunta
                </button>
              </div>

              <div className="table-container">
                <table className="questions-table">
                  <thead>
                    <tr>
                      <th>Título / Pergunta</th>
                      <th>Tema</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map(q => (
                      <tr key={q.id}>
                        <td>{q.title}</td>
                        <td>{q.theme}</td>
                        <td>
                          <span className={`status-badge ${q.active ? 'active' : 'finished'}`}>
                            {q.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-icon" onClick={() => handleOpenQuestionModal(q)}>
                              Editar
                            </button>
                            <button 
                              className={`btn-icon toggle ${q.active ? 'active' : 'inactive'}`} 
                              onClick={() => toggleQuestionStatus(q.id)}
                            >
                              {q.active ? 'Desativar' : 'Ativar'}
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
      {isRoomModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Criar e Configurar Nova Sala</h3>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label>Nome da Sala</label>
                <input 
                  type="text" 
                  value={newRoomName} 
                  onChange={e => setNewRoomName(e.target.value)} 
                  placeholder="Ex: Arena de Programação" 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Tema</label>
                <input 
                  type="text" 
                  value={newRoomTheme} 
                  onChange={e => setNewRoomTheme(e.target.value)} 
                  placeholder="Ex: React & TypeScript" 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Tempo Limite por Questão (segundos)</label>
                <select value={newRoomTime} onChange={e => setNewRoomTime(Number(e.target.value))}>
                  <option value={15}>15 segundos</option>
                  <option value={30}>30 segundos</option>
                  <option value={45}>45 segundos</option>
                  <option value={60}>60 segundos</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setIsRoomModalOpen(false)}>Cancelar</button>
                <button type="submit" className="primary-btn">Salvar Sala</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cadastrar / Editar Pergunta */}
      {isQuestionModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{editingQuestion ? 'Editar Pergunta' : 'Cadastrar Nova Pergunta'}</h3>
            <form onSubmit={handleSaveQuestion}>
              <div className="form-group">
                <label>Enunciado da Pergunta</label>
                <input 
                  type="text" 
                  value={qTitle} 
                  onChange={e => setQTitle(e.target.value)} 
                  placeholder="Ex: Qual a capital do Brasil?" 
                  required 
                />
              </div>
              <div className="form-group">
                <label>Tema / Categoria</label>
                <input 
                  type="text" 
                  value={qTheme} 
                  onChange={e => setQTheme(e.target.value)} 
                  placeholder="Ex: Geografia" 
                  required 
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setIsQuestionModalOpen(false)}>Cancelar</button>
                <button type="submit" className="primary-btn">Salvar Pergunta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}