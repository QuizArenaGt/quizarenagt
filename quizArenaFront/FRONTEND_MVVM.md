# Arquitetura MVVM no frontend do QuizArenaGT

Este documento explica como o frontend (`quizArenaFront/`) está organizado segundo o padrão **Model–View–ViewModel (MVVM)**, como o padrão foi adaptado ao React e como criar novas páginas seguindo a mesma estrutura.

> **Situação atual:** o MVVM foi aplicado às funcionalidades novas: landing page, Header, Footer, banco de perguntas com alternativas e área do aluno (`/jogar`, com ranking e pódio). Login, cadastro e recuperação de senha receberam **apenas a nova identidade visual**. No Dashboard, só a parte de perguntas passou para o MVVM; a de salas continua como estava. A seção 8 explica como adaptar o restante no futuro.

---

## 1. Organização do frontend

```text
quizArenaFront/src/
├── main.tsx                 # Ponto de entrada (importa index.css e App)
├── App.tsx                  # Definição das rotas
├── index.css                # Importa os estilos globais (tokens + global)
│
├── styles/                  # Identidade visual
│   ├── tokens.css           #   cores, espaçamentos, tipografia, bordas, sombras
│   └── global.css           #   reset e regras globais
│
├── models/                  # MODEL — tipos, dados e regras do domínio
│   ├── landing.ts           #   tipos da landing (NavItem, PlatformFeature...)
│   ├── landingContent.ts    #   conteúdo da landing page
│   ├── question.ts          #   pergunta/alternativas (espelha o backend) + validação
│   ├── room.ts              #   sala do professor + geração do código de 6 dígitos
│   ├── roomReport.ts        #   relatório da sala e estatísticas gerais (funções puras)
│   ├── profile.ts           #   perfil, licença, validações e máscara de telefone
│   └── game.ts              #   partida, respostas, pontuação e ranking
│
├── services/                # SERVICE — acesso a dados (temporários, sem API ainda)
│   ├── questionStorageService.ts  # banco de perguntas no localStorage
│   ├── roomStorageService.ts      # salas do professor no localStorage
│   ├── roomResultsService.ts      # resultados das partidas por sala
│   ├── profileService.ts          # perfil (localStorage) e licença de demonstração
│   ├── gameRoomService.ts         # entrada do aluno (123456 ou código de sala)
│   └── mock/                      # perguntas de exemplo e jogadores simulados
│
├── viewmodels/              # VIEWMODEL — estado e ações das telas
│   ├── useLandingViewModel.ts
│   ├── useHeaderViewModel.ts
│   ├── useQuestionBankViewModel.ts   # lista de perguntas do painel
│   ├── useQuestionFormViewModel.ts   # formulário criar/editar pergunta
│   ├── useRoomsViewModel.ts          # salas: criar, editar, excluir, código, relatório
│   ├── useOverviewViewModel.ts       # estatísticas da Visão Geral
│   ├── useProfileViewModel.ts        # perfil do usuário e licença
│   └── usePlayViewModel.ts           # partida do aluno (máquina de estados)
│
├── views/                   # VIEW — páginas
│   ├── Home/
│   │   ├── HomeView.tsx     #   página "/" (compõe as seções)
│   │   ├── sections/        #   seções da landing page
│   │   └── LoginModal/      #   modal que envolve o LoginForm existente
│   ├── Dashboard/
│   │   ├── QuestionFormModal/  # modal de pergunta com alternativas
│   │   ├── RoomCodeModal/      # código da sala em destaque, para projetar
│   │   ├── RoomReportModal/    # resultados da sala finalizada
│   │   ├── OverviewStats/      # estatísticas dos quizzes (Visão Geral)
│   │   ├── ProfileModal/       # edição do perfil + licença
│   │   └── components/RateBar  # barra de % de acerto
│   └── Play/
│       ├── PlayView.tsx     #   página "/jogar" (área do aluno)
│       ├── steps/           #   código, apelido, espera, pergunta, resultado, final
│       └── components/      #   RankingList e Podium
│
├── components/              # VIEW — componentes reutilizáveis
│   ├── layout/              #   Header, Footer, AuthBrandPanel
│   ├── ui/                  #   Button, Logo, Modal, ConfirmDialog, Badge, Icon, FeatureCard, SectionHeading
│   └── Inputs/              #   (já existia) InputEmail, InputPassword
│
├── hooks/                   # Hooks utilitários sem regra de tela
│   ├── useActiveSection.ts
│   └── useFocusOnMount.ts
│
├── features/                # (já existia) módulos por funcionalidade
│   ├── auth/                #   login, cadastro, recuperação de senha
│   │   ├── components/
│   │   ├── services/authService.ts   # SERVICE
│   │   └── types/auth.ts             # MODEL
│   └── Dashboard/
│
└── pages/HomePage.tsx       # (já existia) não está ligado a nenhuma rota
```

As pastas `models/`, `viewmodels/`, `views/`, `components/ui`, `components/layout`, `hooks/` e `styles/` foram criadas nesta etapa. As pastas `features/` e `pages/` foram mantidas como estavam.

---

## 2. O que é MVVM

O MVVM separa uma interface em três responsabilidades:

| Camada | Responsabilidade | Não deve |
|---|---|---|
| **Model** | Representar os dados e as regras do domínio. | Conhecer telas, React ou estilos. |
| **View** | Exibir os dados e capturar as interações do usuário. | Conter regras de negócio, chamar APIs ou guardar estado de tela complexo. |
| **ViewModel** | Preparar os dados para a View, guardar o estado da tela e executar as ações (incluindo chamar os Services). | Montar HTML ou depender de detalhes visuais. |

A **View observa o ViewModel**: quando o estado muda, a interface é atualizada automaticamente. No React isso acontece naturalmente, porque o estado de um hook dispara uma nova renderização.

Também usamos uma camada de **Services**, responsável pela comunicação com o backend. Ela é consumida pelos ViewModels e nunca diretamente pelas Views.

```text
   ┌────────┐  lê estado / chama ações   ┌─────────────┐   usa   ┌──────────┐   HTTP   ┌─────────┐
   │  View  │ ─────────────────────────▶ │  ViewModel  │ ──────▶ │ Service  │ ───────▶ │ Backend │
   │ (.tsx) │ ◀───────────────────────── │   (hook)    │         └──────────┘          └─────────┘
   └────────┘   re-renderiza com estado  └─────────────┘
        │                                       │
        └──────────── ambos usam os tipos ──────┴──────▶ ┌─────────┐
                                                         │  Model  │
                                                         └─────────┘
```

---

## 3. Como o MVVM foi aplicado ao React

O React não tem um "ViewModel" nativo. A adaptação adotada no projeto é:

- **ViewModel = hook personalizado** (`useXxxViewModel`). O hook guarda o estado (`useState`), registra efeitos (`useEffect`) e devolve um objeto com **dados** e **ações**.
- **View = componente de função** que chama o hook e apenas renderiza o que recebeu.
- **Model = arquivos `.ts` sem React**: tipos, constantes e dados.
- **Service = funções assíncronas** que fazem as requisições HTTP.

Regras do projeto:

1. Uma View de página chama **um** ViewModel e repassa os dados às subviews por props.
2. Subviews (seções, cards) são componentes "burros": recebem props e não têm estado de negócio.
3. ViewModels não retornam JSX.
4. Models não importam nada de `views/`, `viewmodels/` ou `components/`.

---

## 4. Views

| View | Arquivo | Papel |
|---|---|---|
| `HomeView` | `src/views/Home/HomeView.tsx` | Página `/`. Compõe Header, seções, Footer e modal de login. |
| `HeroSection` | `src/views/Home/sections/HeroSection.tsx` | Chamada principal e botões "Começar agora" / "Entrar em uma sala". |
| `HeroIllustration` | `src/views/Home/sections/HeroIllustration.tsx` | Composição visual decorativa (sem dados reais). |
| `HowItWorksSection` | `src/views/Home/sections/HowItWorksSection.tsx` | Passo a passo do funcionamento. |
| `AudienceSection` | `src/views/Home/sections/AudienceSection.tsx` | Benefícios para professores e alunos. |
| `FeaturesSection` | `src/views/Home/sections/FeaturesSection.tsx` | Recursos com selo Disponível / Em breve. |
| `JoinRoomSection` | `src/views/Home/sections/JoinRoomSection.tsx` | Entrada por código (desabilitada, recurso previsto). |
| `LoginModal` | `src/views/Home/LoginModal/LoginModal.tsx` | Envolve o `LoginForm` existente em um modal. |
| `Header` | `src/components/layout/Header/Header.tsx` | Cabeçalho reutilizável. |
| `Footer` | `src/components/layout/Footer/Footer.tsx` | Rodapé reutilizável. |
| `AuthBrandPanel` | `src/components/layout/AuthBrandPanel/AuthBrandPanel.tsx` | Painel da marca e título das telas de login, cadastro e recuperação de senha. |
| Componentes `ui/` | `src/components/ui/*` | Peças visuais genéricas (Button, Logo, Modal...). |

Exemplo real: a `HomeView` não guarda estado nem decide nada; apenas liga o ViewModel às subviews.

```tsx
// src/views/Home/HomeView.tsx (trecho)
export default function HomeView() {
    const viewModel = useLandingViewModel();

    return (
        <div className="home">
            <Header
                navItems={viewModel.navItems}
                activeSectionId={viewModel.activeSectionId}
                onLoginClick={viewModel.openLogin}
            />
            <main id={MAIN_CONTENT_ID}>
                <HowItWorksSection id={viewModel.sectionIds.howItWorks} steps={viewModel.steps} />
                {/* ... */}
            </main>
            <LoginModal
                isOpen={viewModel.isLoginOpen}
                onClose={viewModel.closeLogin}
                onSuccess={viewModel.handleLoginSuccess}
            />
        </div>
    );
}
```

---

## 5. ViewModels

| ViewModel | Arquivo | Estado / ações expostos |
|---|---|---|
| `useLandingViewModel` | `src/viewmodels/useLandingViewModel.ts` | conteúdo da página, `activeSectionId`, `isLoginOpen`, `openLogin`, `closeLogin`, `handleLoginSuccess` |
| `useHeaderViewModel` | `src/viewmodels/useHeaderViewModel.ts` | `isMenuOpen`, `isScrolled`, `toggleMenu`, `closeMenu` (e fechamento com Esc ou ao voltar para desktop) |
| `useQuestionBankViewModel` | `src/viewmodels/useQuestionBankViewModel.ts` | `questions`, `activeCount`, `openCreate`, `openEdit`, `saveQuestion`, `toggleStatus`; salva cada alteração pelo `questionStorageService` |
| `useQuestionFormViewModel` | `src/viewmodels/useQuestionFormViewModel.ts` | rascunho da pergunta, `addChoice`/`removeChoice` (de 2 a 4), `setCorrectChoice`, `setTrueFalseAnswer`, `submit` (valida com `validateDraft` do Model) |
| `useRoomsViewModel` | `src/viewmodels/useRoomsViewModel.ts` | `rooms`; formulário de criação/edição (nome, tema, tempo, `selectedQuestionIds`, filtro com vários temas); `submitRoom` (gera o código com `generateRoomCode` do Model); `updateStatus`; exclusão com confirmação; `displayedRoom`/`showCode`; `openReport` (relatório com `buildRoomReport`) |
| `useOverviewViewModel` | `src/viewmodels/useOverviewViewModel.ts` | `stats` (quizzes realizados, participações, acerto médio, desempenho por sala, questões mais difíceis/fáceis) calculadas por `buildOverviewStats` |
| `useProfileViewModel` | `src/viewmodels/useProfileViewModel.ts` | usuário logado (também usado no cabeçalho), `license`, rascunho do formulário, `errors` (de `validateProfile`), `submit` |
| `usePlayViewModel` | `src/viewmodels/usePlayViewModel.ts` | fase da partida (`join → nickname → lobby → question ⇄ feedback → finished`), cronômetro, respostas, pontuação e `ranking` |

Exemplo real: o ViewModel da landing decide o que acontece após o login, mas **não faz a autenticação**. Ela continua dentro do `LoginForm` existente.

```ts
// src/viewmodels/useLandingViewModel.ts (trecho)
export function useLandingViewModel() {
    const navigate = useNavigate();
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const activeSectionId = useActiveSection(OBSERVED_SECTION_IDS);

    const openLogin = useCallback(() => setIsLoginOpen(true), []);
    const closeLogin = useCallback(() => setIsLoginOpen(false), []);

    const handleLoginSuccess = useCallback(() => {
        setIsLoginOpen(false);
        navigate(AFTER_LOGIN_ROUTE); // '/dashboard', igual à rota /login
    }, [navigate]);

    return { navItems: NAV_ITEMS, /* ... */ isLoginOpen, openLogin, closeLogin, handleLoginSuccess };
}
```

**Hooks utilitários × ViewModels:** `src/hooks/useActiveSection.ts` é um hook genérico (observa quais seções estão visíveis), sem regra de nenhuma tela. Ele é **usado por** um ViewModel, mas não é um ViewModel. Essa separação permite reaproveitá-lo em outras páginas.

---

## 6. Models e Services

### Models

- `src/models/landing.ts`: tipos (`NavItem`, `HowItWorksStep`, `AudienceBenefits`, `PlatformFeature`, `IconName`) e a regra de status dos recursos.
- `src/models/landingContent.ts`: conteúdo da landing page (textos, seções e recursos).
- `src/features/auth/types/auth.ts` (já existia): `AuthUser`, `LoginRequest`, `LoginResponse`...

Exemplo de regra de domínio no Model: só é marcado como "Disponível" o que já funciona de ponta a ponta.

```ts
// src/models/landing.ts
export type FeatureStatus = 'available' | 'planned';

export const FEATURE_STATUS_LABEL: Record<FeatureStatus, string> = {
    available: 'Disponível',
    planned: 'Em breve',
};
```

```ts
// src/models/landingContent.ts (trecho)
{ id: 'accounts',     title: 'Contas de usuário',   status: 'available' }, // backend: /auth/register e /auth/login
{ id: 'live-matches', title: 'Partidas simultâneas', status: 'planned' },  // ainda sem endpoint
```

### Services

- `src/features/auth/services/authService.ts` (já existia): `login`, `register` e `recoverPassword`. Nenhum contrato de API foi alterado.
- A landing page **não precisou de Service novo**, porque seu conteúdo é estático.

### Relação entre as camadas

```text
landingContent.ts (Model) ──▶ useLandingViewModel (ViewModel) ──▶ HomeView e seções (View)
auth.ts (Model) ──▶ authService.ts (Service) ──▶ LoginForm (View + lógica, ainda não separados)
```

---

## 7. Como criar uma nova página seguindo o padrão

Exemplo: página **"Meus quizzes"**, quando o backend oferecer o endpoint.

**1. Model:** tipos em `src/models/quiz.ts`.

```ts
export interface QuizSummary {
    id: string;
    title: string;
    questionCount: number;
}
```

**2. Service:** chamadas HTTP em `src/services/quizService.ts` (ou `src/features/quiz/services/`, seguindo o padrão de `features/auth`).

```ts
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function listQuizzes(token: string): Promise<QuizSummary[]> {
    const response = await fetch(`${API_URL}/quizzes`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Erro ao carregar quizzes.');
    return response.json();
}
```

**3. ViewModel:** estado e ações em `src/viewmodels/useMyQuizzesViewModel.ts`.

```ts
export function useMyQuizzesViewModel() {
    const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token') ?? '';
        listQuizzes(token)
            .then(setQuizzes)
            .catch((e: Error) => setError(e.message))
            .finally(() => setIsLoading(false));
    }, []);

    return { quizzes, isLoading, error, hasQuizzes: quizzes.length > 0 };
}
```

**4. View:** apresentação em `src/views/MyQuizzes/MyQuizzesView.tsx`, reutilizando `Header`, `Footer` e os componentes de `ui/`.

```tsx
export default function MyQuizzesView() {
    const { quizzes, isLoading, error, hasQuizzes } = useMyQuizzesViewModel();

    return (
        <>
            <Header />
            <main className="container">
                {isLoading && <p>Carregando...</p>}
                {error && <p role="alert">{error}</p>}
                {hasQuizzes && quizzes.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} />)}
            </main>
            <Footer />
        </>
    );
}
```

**5. Rota:** registrar em `src/App.tsx`.

```tsx
<Route path="/quizzes" element={<MyQuizzesView />} />
```

**Checklist:**

- [ ] A View não chama `fetch` nem acessa `localStorage` diretamente.
- [ ] O ViewModel não retorna JSX.
- [ ] O Model não importa React.
- [ ] Cores e espaçamentos vêm de `styles/tokens.css`.
- [ ] As classes CSS têm prefixo próprio (ex.: `my-quizzes-`), para não colidir com as classes globais existentes.

---

## 8. Funcionalidades que ainda não foram adaptadas

Estes módulos foram **preservados como estavam**. Abaixo, a sugestão de adaptação gradual para cada um, a ser feita em tarefas próprias e com revisão de quem os desenvolveu.

| Módulo | Situação atual | Adaptação sugerida |
|---|---|---|
| `LoginForm` | Estado, validação, chamada ao `authService` e gravação no `localStorage` ficam no componente. | Extrair `useLoginViewModel` (email, senha, erro, carregamento, `submit`). O componente passa a só renderizar. |
| `RegisterForm` | Validações (8 caracteres, confirmação de senha) e navegação dentro do componente. | Extrair `useRegisterViewModel`. Mover as regras de senha para um Model (`models/auth`). |
| `RecoverPasswordForm` | Chama `/api/auth/recover-password`, rota que **não existe** no backend. Usa URL fixa e um atraso artificial de 1 s. | Ajustar o Service quando o endpoint existir. Extrair `useRecoverPasswordViewModel`. |
| `DashboardForm` | As abas de perguntas e de salas já usam ViewModels (`useQuestionBankViewModel` e `useRoomsViewModel`), salvando no navegador. A sala tem código gerado automaticamente e perguntas escolhidas pelo professor. O "42 jogadores online" continua fixo. | Quando o backend expor `/questions` e `/rooms`, trocar o `questionStorageService` e o `roomStorageService` por chamadas HTTP com as mesmas assinaturas. O código da sala deverá ser gerado pelo servidor, para garantir que seja único entre todos os professores. |
| Área do aluno (`/jogar`) | Aceita a sala `123456` e os códigos das salas criadas no painel, mas só no **mesmo navegador**. Os outros jogadores são simulados, e o próprio aluno inicia a partida. | Quando houver salas no backend, implementar `joinRoom` com a API e receber o ranking e o início da partida em tempo real (ex.: WebSocket). O `usePlayViewModel` e as Views não precisam mudar de estrutura. |
| Perfil do usuário | Nome e e-mail editados ficam só no navegador e são sobrescritos no próximo login. O telefone é guardado à parte. Licença e plano são dados fixos de demonstração. | Criar `PATCH /users/me` e o campo telefone no backend; definir planos e licenças reais. Depois, trocar o `profileService`. |
| Resultados e relatórios | Registrados no navegador quando o aluno conclui a partida. Incluem jogadores simulados, fixos por sala. | Com partidas em tempo real, o servidor registra as respostas e o `roomResultsService` passa a buscá-las da API. |
| Campo `theme` da pergunta | Existe apenas no frontend; o modelo `Question` do backend não tem tema. | Combinar com a equipe de backend se o campo será criado. |
| `pages/HomePage.tsx` | Não está ligado a nenhuma rota. | Avaliar com a equipe se deve ser removido ou reaproveitado. |
| Sessão do usuário | Leitura de `localStorage` repetida em vários componentes. A rota `/dashboard` não é protegida. | Criar um `authSessionService` (ler, gravar e limpar a sessão) e uma rota protegida. |
| Header autenticado | O `Header` aceita a prop `actions` para receber o menu do usuário. | Criar `UserMenu` (nome, perfil e botão sair) alimentado por um ViewModel de sessão e passá-lo em `actions`. |

---

## 9. Decisões de integração com o código existente

- **O login no modal reutiliza o `LoginForm` original.** O `LoginModal` apenas o envolve e, via CSS, esconde o painel lateral da marca, já que o modal mostra o próprio logotipo e título.
- **Telas de autenticação com a nova identidade.** O `LoginForm.css`, compartilhado por login, cadastro e recuperação de senha, foi reescrito no layout de tela dividida, mantendo todos os nomes de classe originais. No JSX dessas telas, a única mudança foi trocar o bloco do logo antigo (escudo + "QUIZ ARENA") pelo `AuthBrandPanel`. Estados, validações, chamadas ao `authService` e navegação não mudaram. O `overflow: hidden` global, que travava a rolagem e cortava o formulário de cadastro em telas baixas, foi removido.
- **Dashboard no tema claro.** O `DashboardForm.css` foi reescrito com os tokens da identidade, mantendo os nomes de classe e ganhando um layout para celular (o menu lateral vira uma barra no topo). No JSX, só mudaram o logo da barra lateral (agora `<Logo />`) e um estilo inline, que virou a classe `room-finished-label`.
- **Campos compartilhados** (`InputEmail.css` e `InputPassword.css`) passaram a usar os tokens em vez das variáveis antigas (`--action-orange`, `--primary-blue`...).
- **Prefixos de classe:** `ui-`, `site-` e `home-`. Evitam colisão com classes globais existentes, como `.login-footer`, `.footer-link`, `.input-wrapper` e a regra `h2` do `RecoverPasswordForm.css`.
- **Sem dependências novas:** ícones em SVG próprio, modal com o `<dialog>` nativo e a fonte do sistema.
