# QuizArena

O QuizArena é um sistema interativo de quizzes. Este repositório contém todo o código fonte da aplicação, englobando tanto a interface de usuário quanto a API do servidor.

## Stack utilizada

* Node.js — Backend
* React — Frontend
* PostgreSQL — Banco de dados
* Docker — Containerização

## Estrutura do projeto

O repositório segue o modelo de monorepo, separando as responsabilidades nas seguintes pastas:

```text
quizarenagt/
  ├── quizArenaFront/    # Aplicação frontend (React)
  ├── quizArenaBackend/  # Aplicação backend (Node.js)
  └── docker-compose.yml # Orquestração dos containers
```

> **Nota sobre Integração Contínua (CI):** O repositório possui pipelines independentes configuradas (GitHub Actions e SonarQube Cloud). Sempre que houver alterações de código dentro da pasta `quizArenaFront/`, a pipeline de validação do frontend será ativada automaticamente. O mesmo ocorre para o backend ao alterar arquivos dentro de `quizArenaBackend/`.

## Pré-requisitos

Para executar o projeto localmente, é necessário possuir as seguintes ferramentas instaladas:

* Git
* Node.js (versão 20 ou superior)
* Docker e Docker Compose

## Configuração do ambiente

O projeto utiliza um único arquivo de variáveis de ambiente centralizado na raiz.

1. Clone o repositório:

```bash
git clone https://github.com/QuizArenaGt/quizarenagt.git
cd quizarenagt
```

2. Crie o seu arquivo de variáveis locais copiando o arquivo de exemplo na raiz do projeto:

```bash
cp .env.example .env
```

*(Abra o arquivo `.env` gerado e preencha as informações conforme a necessidade da sua máquina local).*

## Execução com Docker Compose

O Docker Compose é responsável por subir o banco de dados PostgreSQL e demais dependências de infraestrutura. Na raiz do repositório, execute:

```bash
docker-compose up -d
```

Para encerrar os containers em execução, utilize:

```bash
docker-compose down
```

## Executando o projeto

Após a configuração das variáveis de ambiente e a execução do Docker, inicie os servidores de desenvolvimento.

### Backend

```bash
cd quizArenaBackend
npm install
npm run dev
```

### Frontend

Em um novo terminal:

```bash
cd quizArenaFront
npm install
npm run dev
```

## Regras de Contribuição

Para entender o fluxo de trabalho, padrão de nomenclaturas de branches e commits, leia o [CONTRIBUTING.md](./CONTRIBUTING.md).
