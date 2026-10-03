# Contribuindo com o QuizArena

Este documento define as regras para contribuição e o fluxo de desenvolvimento do projeto QuizArena.

## Fluxo de desenvolvimento

Cada implementação deve seguir o fluxo:

1. Criar ou utilizar uma Issue para a tarefa.
2. Criar uma branch própria para a implementação.
3. Realizar as alterações e commits.
4. Abrir um Pull Request.
5. Solicitar revisão de outro integrante.
6. Realizar os ajustes solicitados, quando necessário.
7. Fazer o merge após pelo menos uma aprovação.
8. Acompanhar a conclusão da tarefa pelo GitHub Projects.

## Branches

As branches devem seguir o padrão:

```text
<tipo>/<issue>-<descricao>
```

Tipos permitidos:

* `feature` — nova funcionalidade
* `fix` — correção de bug
* `refactor` — refatoração
* `docs` — documentação
* `chore` — tarefas de configuração ou manutenção
* `test` — criação ou alteração de testes

Exemplos:

```text
feature/15-criar-quiz
fix/23-validar-resposta
refactor/31-organizar-servico
docs/40-documentar-api
chore/12-configurar-github
test/27-testes-usuario
```

A descrição deve ser curta, objetiva e utilizar letras minúsculas separadas por hífen.

As branches principais do projeto são:

* `main` — versão principal e estável do projeto.
* `back` — integração das alterações de backend.
* `front` — integração das alterações de frontend.

Não devem ser realizadas alterações diretamente nas branches principais.

## Commits

Os commits devem seguir o padrão:

```text
tipo: descrição
```

Tipos principais:

* `feat` — nova funcionalidade
* `fix` — correção de bug
* `refactor` — refatoração
* `docs` — documentação
* `test` — testes
* `chore` — manutenção ou configuração

Exemplos:

```text
feat: adiciona criação de quiz
fix: corrige validação de resposta
refactor: reorganiza serviço de usuário
test: adiciona testes do quiz
docs: atualiza documentação da API
chore: configura ambiente do projeto
```

A mensagem do commit deve ser objetiva e descrever a alteração realizada.

## Pull Requests

Toda alteração deve ser submetida por meio de um Pull Request.

O título do Pull Request deve seguir o padrão:

```text
tipo: descrição
```

Exemplo:

```text
feat: implementa criação de quiz
```

O Pull Request deve:

* Descrever brevemente as alterações realizadas.
* Referenciar a Issue relacionada.
* Informar os testes realizados.
* Utilizar o template de Pull Request do projeto.

Quando a alteração concluir uma Issue, utilizar:

```text
Closes #<número-da-issue>
```

Exemplo:

```text
Closes #15
```

## Code Review

Todo Pull Request deve possuir pelo menos uma aprovação de outro integrante antes do merge.

O autor do Pull Request não deve aprovar o próprio Pull Request como única revisão.

As alterações solicitadas durante a revisão devem ser realizadas antes do merge, quando aplicável.

## Issues

As tarefas do projeto devem ser registradas como Issues e vinculadas ao GitHub Projects.

As Issues devem possuir as labels adequadas ao tipo e ao contexto da tarefa.

Cada implementação deve estar vinculada a uma Issue correspondente.

## GitHub Projects

O GitHub Projects é utilizado para acompanhar o andamento das tarefas do projeto.

As Issues devem ser movimentadas conforme o progresso da implementação, permitindo acompanhar o fluxo desde o planejamento até a conclusão.

## Regra geral

Toda alteração no projeto deve seguir o fluxo:

```text
Issue
  ↓
Branch
  ↓
Commits
  ↓
Pull Request
  ↓
Code Review
  ↓
Merge
```
