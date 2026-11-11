# Arquitetura MVVM no frontend do QuizArenaGT

Este documento explica como o frontend (`quizArenaFront/`) está organizado segundo o padrão **Model–View–ViewModel (MVVM)**, como o padrão foi adaptado ao React e como criar novas páginas seguindo a mesma estrutura.

> **Situação atual:** o MVVM foi aplicado às funcionalidades novas (landing page, Header e Footer). Os módulos que já existiam (login, cadastro, recuperação de senha e Dashboard) **não foram refatorados**. A seção 8 explica como adaptá-los no futuro.

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
├── models/                  # MODEL — tipos e dados do domínio
│   ├── landing.ts           #   tipos (NavItem, PlatformFeature...)
│   └── landingContent.ts    #   conteúdo da landing page
│
├── viewmodels/              # VIEWMODEL — estado e ações das telas
│   ├── useLandingViewModel.ts
│   └── useHeaderViewModel.ts
│
├── views/                   # VIEW — páginas
│   └── Home/
│       ├── HomeView.tsx     #   página "/" (compõe as seções)
│       ├── HomeView.css
│       ├── sections/        #   seções da landing page
│       └── LoginModal/      #   modal que envolve o LoginForm existente
│
├── components/              # VIEW — componentes reutilizáveis
│   ├── layout/              #   Header, Footer
│   ├── ui/                  #   Button, Logo, Modal, Badge, Icon, FeatureCard, SectionHeading
│   └── Inputs/              #   (já existia) InputEmail, InputPassword
│
├── hooks/                   # Hooks utilitários sem regra de tela
│   └── useActiveSection.ts
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
| `DashboardForm` | Dados de exemplo fixos (salas, perguntas e "42 jogadores online"), sem integração com o backend. | Separar Models (`Room`, `Question`), criar Services quando houver endpoints e um `useDashboardViewModel`. |
| `pages/HomePage.tsx` | Não está ligado a nenhuma rota. | Avaliar com a equipe se deve ser removido ou reaproveitado. |
| Sessão do usuário | Leitura de `localStorage` repetida em vários componentes. A rota `/dashboard` não é protegida. | Criar um `authSessionService` (ler, gravar e limpar a sessão) e uma rota protegida. |
| Header autenticado | O `Header` aceita a prop `actions` para receber o menu do usuário. | Criar `UserMenu` (nome, perfil e botão sair) alimentado por um ViewModel de sessão e passá-lo em `actions`. |

---

## 9. Decisões de integração com o código existente

- **O login no modal reutiliza o `LoginForm` original.** O `LoginModal` apenas o envolve, e a aparência é ajustada redefinindo as variáveis CSS que o login já usa (`--action-orange`, `--light-blue`...) dentro de `.login-modal`. Na rota `/login`, nada muda.
- **`LoginForm.css` teve só o escopo das regras globais ajustado.** As regras de `*` e de `html, body`, inclusive o `overflow: hidden` que travava a rolagem de qualquer página, passaram a valer apenas quando uma tela de autenticação é a página atual. Nenhuma regra visual do login foi alterada.
- **Prefixos de classe:** `ui-`, `site-` e `home-`. Evitam colisão com classes globais existentes, como `.login-footer`, `.footer-link`, `.input-wrapper` e a regra `h2` do `RecoverPasswordForm.css`.
- **Sem dependências novas:** ícones em SVG próprio, modal com o `<dialog>` nativo e a fonte do sistema.
