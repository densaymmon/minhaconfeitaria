# Auditoria e plano de melhorias — Doce Gestão

> **Etapa A** do projeto de auditoria, simplificação e preparação comercial.
> Data da análise: 28/10/2026 · Base analisada: `main` no commit `ab8cc63` (PR #208).
> Este documento não contém segredos, credenciais nem dados pessoais reais.

## 1. Como esta auditoria foi feita (e o que ela não cobre)

A auditoria desta etapa foi **estática**: leitura do código, das migrations, das políticas de acesso, dos workflows de CI e dos testes, mais consultas ao GitHub pela API REST. Nenhum dado de produção foi lido ou alterado, nenhuma migration foi executada e nenhum código da aplicação foi modificado.

**Limitações de ambiente (registradas conforme a regra 13):**

| Verificação | Situação | Motivo |
|---|---|---|
| Instalação de dependências | Não executada | O `bun.lock` contém 217 URLs de tarball do cache de npm do Lovable (`pkg.dev`), bloqueado pela política de rede desta sessão; o DNS direto do npmjs também não resolve. |
| Typecheck, lint, testes unitários, build | Não executados localmente | Dependem da instalação acima. A evidência disponível é o CI do GitHub na `main` (workflow *Quality checks* com sucesso nas execuções mais recentes). |
| Smoke tests SQL (`tests/db/*.sql`) | Não executados localmente | Não há servidor PostgreSQL nesta sessão (apenas o cliente `psql`). Rodam no CI. |
| Backups e restauração | Não verificado | Sem acesso à configuração do projeto de banco. |
| Estado real do banco de produção | Parcial | Em 29/10/2026 foi usada a consulta somente leitura de pedidos (nenhum dado alterado; nomes e telefones de clientes não constam neste documento). Esquema, políticas e backups continuam sem verificação. |

**Cobertura desta etapa:**

| Área | Cobertura |
|---|---|
| RLS, funções `SECURITY DEFINER`, grants, segredos versionados | Auditada de forma estática (ver seção 4) |
| CI, workflows, organização dos testes | Auditada |
| Navegação | Auditada (rotas e menus lidos) |
| Pedidos, produção, financeiro | **Parcial**: leitura dirigida de trechos; auditoria completa nas Etapas C e E |
| Produtos, receitas, custos, estoque | **Parcial**: apenas regras do `AGENTS.md` e testes existentes |
| Catálogo online, onboarding | **Não auditados em profundidade**: Etapa F |
| Autenticação e recuperação de senha, uploads e políticas de storage | **Não auditados em profundidade**: Etapa G |
| Acessibilidade, desempenho, dependências vulneráveis, WhatsApp, exportações, ferramentas MCP | **Não auditados** nesta etapa |

## 2. Arquitetura efetivamente utilizada

- **Frontend:** TanStack Start + React 19 + TypeScript, Tailwind 4, TanStack Query, shadcn/ui. PWA com notificações push.
- **Backend e dados:** Supabase (PostgreSQL com RLS). Regras de negócio críticas em funções SQL (RPCs transacionais). Funções de servidor em `src/lib/*.functions.ts`.
- **Multiempresa:** o tenant é o `user_id` da dona; equipe (`gerente`/`producao`) trabalha no tenant da dona via `public._tenant()`. Acesso da plataforma controlado por `confeitarias.acesso` e política RESTRICTIVE `acesso_liberado`. Planos e assinaturas já existem (`planos`, `assinaturas`).
- **Painel de administração da plataforma:** app separado em `admin/` (GitHub Pages), com sessão própria.
- **Migrations:** dois históricos — `drizzle/migrations` (50 arquivos, aplicados no CI) e `supabase/migrations` (14 arquivos). A reconciliação já foi auditada em `docs/audits/`; esta auditoria **não a refaz**.
- **CI:** `quality.yml` (frontend + PostgreSQL 17 com 18 smoke tests SQL e simulação de reconciliação), `test-contas-pagar-rpcs.yml`, `admin-pages.yml` e `auto-merge-verified-prs.yml`.
- **Processo:** o repositório é conectado ao Lovable; commits na branch principal sincronizam de volta. Não reescrever histórico (ver `AGENTS.md`).

## 3. Achados

Legenda de status: **Confirmado** (há evidência no código/CI) · **A verificar** (risco plausível, falta evidência) · **Descartado** (verificado e não é defeito).

### 3.1 Confirmados

#### C1 — Workflow faz merge automático de PRs com CI verde
- **Gravidade:** alta (processo)
- **Impacto:** qualquer PR não-rascunho cujo CI passe é mesclado com *squash* na `main` e sincronizado com o Lovable, sem revisão humana. Conflita com a regra do projeto de não mesclar automaticamente. O histórico confirma o uso: os PRs #189 a #208 foram mesclados em sequência.
- **Arquivos:** `.github/workflows/auto-merge-verified-prs.yml`
- **Causa:** automação intencional (`gh pr merge --squash` após `gh pr checks --watch`). O workflow ignora PRs em rascunho.
- **Decisão do proprietário (29/10/2026):** **manter** o merge automático. O workflow não foi alterado.
- **Consequência prática:** todo PR não-rascunho com CI verde é mesclado e sincronizado com o Lovable. Por isso, os PRs deste trabalho são abertos como **rascunho** e só passam a "pronto para revisão" depois da revisão do diff e dos testes; nesse momento o merge acontece sozinho.
- **Status:** aceito como decisão de negócio; risco residual conhecido.
- **Risco da mudança:** baixo. **Testes:** abrir PR de teste em rascunho e confirmar que não é mesclado.

#### C2 — O lint do CI cobre apenas 12 de ~195 arquivos (**resolvido na Etapa H, 29/10/2026**)
- **Resolução:** medição no CI mostrou só 6 erros e 22 avisos em todo o código (a estimativa inicial de "violações de formatação" referia-se apenas ao Prettier, que segue desligado). Os 6 erros foram corrigidos sem mudar comportamento e o passo do CI agora roda `eslint src admin/src` em todos os arquivos, com erros bloqueando e avisos (16 `react-refresh/only-export-components` em componentes de UI e 6 `react-hooks/exhaustive-deps`) apenas informados. O arquivo gerado `previewAuthStorage.ts` ("Do not edit") é ignorado. A formatação com Prettier continua adiada.
- **Texto original da avaliação:**
- **Gravidade:** média
- **Impacto:** erros de código e de hooks em ~94% dos arquivos de `src/` e `admin/` não bloqueiam o CI. O próprio workflow registra em comentário que o lint do repositório inteiro acusa violações de formatação preexistentes e que a limpeza foi adiada.
- **Arquivos:** `.github/workflows/quality.yml` (passo *Lint changed application files*).
- **Causa:** adiamento da limpeza de Prettier; lista fixa de arquivos.
- **Correção recomendada:** formatar o repositório (`prettier --write`) em PR próprio e só então trocar o passo por `eslint .` sem lista. Requer ambiente com dependências instaladas. Etapa H.
- **Risco da mudança:** médio (diff grande, só formatação). **Testes:** `eslint .`, `tsc`, testes e build verdes antes e depois; diff restrito a formatação.

#### C3 — Indicadores financeiros calculados em três componentes, sem testes e sem fórmula documentada
- **Gravidade:** média
- **Impacto:** a mesma regra de saldo de conta (`Math.max(0, valor − valor_pago)`) está repetida em `financeiro.tsx`, `contas-pagar.tsx` e `relatorios.tsx`, além de filtros de cancelamento diferentes em cada arquivo. Há risco de divergência entre painel, relatório e movimentações, e nenhum teste cobre esses totais porque vivem dentro de componentes de tela.
- **Arquivos:** `src/routes/_authenticated/financeiro.tsx`, `contas-pagar.tsx`, `relatorios.tsx`, `painel.tsx`, `fluxo-caixa.tsx`.
- **Causa:** cálculo feito na camada de tela, sem módulo compartilhado (diferente de `calc.ts` e `gestao.ts`, que já têm testes).
- **Correção recomendada:** extrair para `src/lib/financeiro.ts` funções puras (saldo de conta, total a pagar, vencido, recebido, a receber), cobrir com testes e documentar a fórmula de cada indicador. Etapa E.
- **Risco da mudança:** médio (números que o usuário já vê). **Testes:** testes unitários com casos de cancelamento, pagamento parcial, estorno e período; comparar valores antes/depois em dados de teste.

#### C4 — Menu "Mais" é uma lista longa e sem grupos, mantida em duas cópias
- **Gravidade:** média (UX e manutenção)
- **Impacto:** a barra principal já segue a estrutura desejada (Hoje, Pedidos, Produção, Clientes). O menu "Mais" reunia 12 entradas soltas mais 4 atalhos de compras/estoque, sob os títulos "Gestão" e "Compras e estoque". A mesma lista existia em **duas cópias independentes**: a gaveta do layout (`route.tsx`) e a página `/mais` (`mais.tsx`), destino de "voltar" de cerca de 17 telas. Uma tela nova precisava ser incluída nos dois lugares.
- **Correção da avaliação inicial:** a primeira versão deste item dizia que a rota `/relatorios` não aparecia no menu e sugeria uma lacuna no Financeiro. Isso estava impreciso: a página Financeiro **já tem** as abas Visão geral, Lançar despesas, Movimentações e Relatórios (`financeiro.tsx`, que incorpora Despesas, Contas a pagar e Relatórios). Não há menu financeiro paralelo a corrigir. Branches antigas com nomes parecidos (`feat/mais-menu-lateral-deslizante`, `feat/financeiro-menu-integrado`) já foram mescladas e não foram duplicadas.
- **Arquivos:** `src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/mais.tsx`.
- **Correção aplicada na Etapa B (PR #210):** fonte única em `src/lib/navegacao.ts`, quatro grupos (Dia a dia · Produtos e insumos · Financeiro · Equipe e configurações), sem remover nenhuma tela, com teste que impede que telas sumam, se repitam ou apontem para rotas inexistentes.
- **Risco da mudança:** baixo/médio. **Validação:** CI do PR (tipos, lint dos arquivos listados, testes, build); a aparência em celular e desktop não foi verificada em navegador.

#### C5 — Código ilegível e arquivos muito grandes
- **Gravidade:** baixa (manutenção)
- **Impacto:** `despesas.tsx` tem 24 linhas, com funções inteiras em uma única linha longa, o que dificulta revisão. Telas grandes: `compras.tsx` (1170 linhas), `relatorios.tsx` (1023), `pedidos.$id.tsx` (1016), `producao.tsx` (793), `contas-pagar.tsx` (718).
- **Correção recomendada:** formatar `despesas.tsx` (parte de C2) e extrair lógica pura das telas grandes **só quando** a etapa correspondente tocar nelas, para não gerar diffs sem relação com o objetivo.
- **Risco:** baixo a médio. **Testes:** os da área tocada.

#### C6 — Quatorze módulos de `src/lib` sem teste de unidade
- **Gravidade:** baixa
- **Módulos:** `csv`, `error-capture`, `error-page`, `exportar-dados`, `format`, `foto-catalogo`, `hooks`, `lovable-error-reporting`, `purchase-document-ocr`, `push-cliente`, `queries`, `termos`, `utils`, `whatsapp-pedido`.
- **Impacto:** `format.ts` (moeda/datas), `csv.ts`/`exportar-dados.ts` (exportações) e `whatsapp-pedido.ts` (mensagens) afetam o que o cliente vê; os demais têm risco menor.
- **Correção recomendada:** testes para formatação, CSV e mensagens de WhatsApp na etapa que tocar cada um.

#### C7 — Lockfile aponta para o cache de npm do Lovable
- **Gravidade:** baixa (reprodutibilidade fora do Lovable/GitHub), sem falha no CI atual
- **Evidência:** 217 dos 813 pacotes do `bun.lock` têm URL de tarball em `europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache` (1 em `europe-west1`); os demais usam o registry padrão. Todos os 813 têm hash de integridade `sha512`. A origem é o cache de npm do ambiente do Lovable, não um registry privado de terceiros.
- **Impacto:** não afeta o sistema em execução (banco, site publicado, dados). Só muda de onde o `bun install` baixa os arquivos. Ambientes sem acesso a esse host (como a sessão desta auditoria) não conseguem instalar dependências; o CI do GitHub instala normalmente.
- **Trocar pelo npm público:** tecnicamente possível (os hashes de integridade validam o conteúdo), mas **não recomendado agora**: o ambiente do Lovable tende a reescrever o lockfile com o cache dele, gerando conflitos e ruído nos PRs, e não há como validar a troca nesta sessão. Fica como melhoria opcional, a validar no GitHub Actions.
- **Status:** rebaixado de média para baixa; nenhuma alteração planejada.

### 3.2 A verificar

| ID | Risco | Evidência atual | Como verificar | Etapa |
|---|---|---|---|---|
| R1 | ~~Vocabulário de status de pedido inconsistente entre camadas~~ **Verificado na Etapa C** | O `CHECK` vigente em produção (`pedidos_status_check`) aceita `recebido, confirmado, em_producao, pronto, finalizado, entregue, cancelado`, ou seja, inclui `pronto` e `finalizado` (migrations `supabase/migrations`). O texto anterior baseava-se só na migration `0000`. `perdido` não aparece em `src/` | Consulta somente leitura ao `pg_constraint` em 29/10/2026. Os dados em uso continuam dentro do vocabulário | C (concluído) |
| R2 | Duas fontes de recebimento do pedido (`valor_entrada` legado e `pedido_pagamentos`) | O relatório consolida via `calcularRecebimentoPedido`; falta confirmar que nenhuma tela lê só um dos lados | Revisar usos de `valor_entrada` e rodar `payment-receipts-smoke.sql` | C/E |
| R3 | RPCs anônimas do catálogo (`avaliar_pedido`, `informar_pagamento_pedido`, `acompanhar_pedido_catalogo`) protegidas por código de 10 caracteres | Funções concedidas a `anon`; não verificada a entropia do código nem limite de tentativas | Revisar geração de `codigo_curto` e política de limite de requisições | G |
| R4 | `registrar_erro` aceita chamadas anônimas | Mitigado no desenho: deduplicação por hora, teto de 200 novas linhas/hora, retenção de 30 dias | Confirmar o teto no teste `plataforma-uso-smoke.sql` | G |
| R5 | ~~Sete funções `SECURITY DEFINER` sem referência a tenant~~ **Verificado na Etapa G** | Cinco são funções de gatilho que usam `NEW.user_id` (`_limite_plano_pedidos`, `_limite_plano_produtos`, `snapshot_movimento_producao`, `snapshot_producao_evento`) ou a identidade da linha (`limitar_proprietario_unico`, `release_owner_claim`: não chamáveis como RPC). `_entrar_na_equipe` não é executável por usuários (sem EXECUTE para `anon` e `authenticated`) e valida convite, e-mail e vínculo | Consulta somente leitura ao catálogo do banco em 29/10/2026 | G (concluído) |
| R6 | Backups e restauração | Sem acesso à infraestrutura | Verificar no provedor e testar uma restauração | G/H |
| R7 | Dependências vulneráveis | Não foi possível rodar auditoria de dependências | `bun audit` ou equivalente no CI | G/H |

### 3.3 Riscos descartados (verificados)

| Suspeita | Resultado | Evidência |
|---|---|---|
| 10 tabelas principais sem RLS | **Falso positivo** da busca textual | RLS habilitado por laço dinâmico em `0000_migration.sql` (linha 118) e `0024_pedidos_recorrentes.sql` (linha 46) |
| Função `SECURITY DEFINER` sem `search_path` | **Nenhuma** em 75 funções (análise estática heurística da última definição de cada função) | Script de varredura desta auditoria |
| Segredos versionados | **Nenhum encontrado** (chaves privadas, JWT, `service_role`, chaves de API); `.env` versionado contém só URL e chave **publicável** do Supabase, públicas por desenho | Varredura do repositório sem imprimir valores |
| Validação de despesa só no frontend | **Refutado:** `despesa_valida` exige `valor > 0` e descrição de 1 a 200 caracteres no banco | `0001_secure_validation_atomic_saves.sql`, linha 14 |
| Parcelas de conta a pagar duplicáveis ao repetir a solicitação | **Protegido:** índice único de número de parcela, `operacao_id` único por usuário, lock advisório e `FOR UPDATE`; há teste de concorrência | `20261025140000_contas_pagar_parcelamento_manual.sql`, `docs/deploy/contas-pagar-rpcs.sql`, `tests/db/contas-pagar-concurrency.sh` |
| Funções auxiliares expostas via RPC | `_plano_tem`, `_situacao_atual`, `_assinatura_liberada` e `_validar_componentes` têm `REVOKE` de `PUBLIC`, `anon` e `authenticated`; `plataforma_publica` é pública por desenho | Migrations `0039` e `0044` |

### 3.4 Observações dos dados de produção (leitura somente)

Fonte: consulta de pedidos com entrega de 01/01/2025 a 31/12/2026 (43 registros, resultado completo, sem paginação adicional). Contagens feitas manualmente sobre o retorno; devem ser reconfirmadas na Etapa C com consulta SQL.

- **Custo zero em itens antigos (confirmado):** 9 itens em 7 pedidos `entregue` têm `custo_unitario = 0`. É o item já registrado no `roadmap.md` ("correção assistida de itens antigos com custo zero", aguardando confirmação do proprietário). Impacto: o lucro desses pedidos aparecia superestimado.
  - **Corrigido em 29/10/2026, a pedido do proprietário:** os 9 itens receberam o custo atual calculado pela função do banco `_custo_unitario_produto` (baguete de calabresa com queijo R$ 15,411; baguete de calabresa com queijo e catupiry R$ 18,9217; baguete com frango e catupiry R$ 18,132; pão caseiro R$ 1,9256). A atualização foi restrita a esses 9 itens (por identificador) e só onde o custo gravado era zero. Nenhum outro item, pedido, pagamento ou estoque foi tocado; os triggers de `pedido_itens` não disparam ao alterar só `custo_unitario`. O custo dos 7 pedidos aumentou em cerca de R$ 152,29. Para desfazer, basta voltar o `custo_unitario` desses 9 itens para 0. Depois da correção, não restam itens com custo zero (54 itens com custo).
  - A função existente `recalcular_custos_historicos()` **não foi usada**: ela recalcula todos os itens do usuário a partir da receita atual e alteraria o histórico inteiro.
- **Itens entregues sem produção registrada (a verificar):** vários itens de pedidos `entregue` têm `quantidade_produzida = 0`. Pode ser legítimo (produto pronto/congelado) ou indicar que a produção não foi registrada, o que afetaria o estoque. Verificar na Etapa C e D antes de qualquer conclusão.
- **Pagamento (não é defeito):** há pedidos `entregue` com `valor_entrada` igual ao total e `saldo_quitado = false`. `calcularRecebimentoPedido` (`src/lib/calc.ts`) calcula `saldo = venda − recebido`, então o saldo é zero. Conferido.
- **Duas fórmulas de "recebido" (a verificar, R2):** `totaisPedido` ignora o histórico de pagamentos e `calcularRecebimentoPedido` o considera. Falta confirmar qual tela usa cada uma.
- **Numeração com lacunas:** os números 1, 26 e 32 não aparecem no período consultado (podem estar fora do período ou ter sido excluídos). Verificar na Etapa C como a exclusão de pedidos é tratada.

### 3.5 Etapa C — pedidos, pagamentos e produção (29/10/2026)

Método: leitura do código (`pedidos.$id.tsx`, `queries.ts`, `calc.ts`), leitura da função `salvar_pedido` em produção (mesma definição das migrations: hash idêntico) e consultas somente leitura de consistência. Os testes de banco foram executados **localmente** em um PostgreSQL 16 descartável, com as 51 migrations aplicadas; o banco de produção não foi alterado.

**Dados de produção (43 pedidos):** 0 divergências entre `valor_entrada` e a soma de `pedido_pagamentos` (20 pedidos com recebimentos detalhados); 0 pedidos pagos acima do total; 0 cancelados com dinheiro registrado. 10 pedidos antigos estão marcados como quitados sem valor registrado (legado, sem linhas de pagamento): não foram alterados.

**Confirmado e corrigido (C8):** `salvar_pedido`, ao editar, gravava `valor_entrada` e `saldo_quitado` vindos do navegador. Com um recebimento feito em outro aparelho, um salvamento com tela desatualizada zerava o valor pago do pedido enquanto o histórico mantinha o recebimento (reproduzido no banco local: pagamentos R$ 50, pedido R$ 0). A tela se protege usando o cache, mas isso não é uma garantia. Correção na migration `0047_salvar_pedido_preservar_recebimentos.sql` (preserva os dois campos quando o pedido já tem linhas em `pedido_pagamentos`) e teste `tests/db/salvar-pedido-recebimentos-smoke.sql`, que falha sem a migration e passa com ela. **Aplicada em produção em 29/10/2026 com autorização do proprietário** (troca apenas do corpo da função; definição conferida por hash contra a do banco de teste; reversão: reaplicar a definição da migration `0011`).

**Observações sem correção nesta etapa (decisão ou etapa futura):**
- Não há regra central de transição de status: o status é gravado diretamente em cinco pontos do código. Sem incidente nos dados; avaliar uma regra única com testes numa etapa posterior.
- `avancarPedidosDoDia` (passagem para "em produção") roda no navegador, uma vez por dia; se ninguém abrir o app, não roda.
- `pedidos.numero` é uma sequência global (não por confeitaria): números têm lacunas (1, 26, 32) e uma confeitaria vê saltos por causa de outras. Cosmético; relevante para o piloto com várias confeitarias.
- Entregas sem produção registrada (22 itens de pedidos entregues com receita): impacto no estoque a avaliar na Etapa D.
- Não existe fluxo de estorno/devolução de recebimento de pedido; a correção é feita editando o recebimento.

### 3.6 Etapa D — produtos, receitas, custos e estoque (29/10/2026)

Método: consultas somente leitura em produção e leitura das funções `_custo_base_produto` / `_custo_unitario_produto`. A única alteração de dados foi a autorizada nos pedidos nº 11 e nº 13, descrita abaixo.

**Confirmado correto**
- A fórmula de custo está certa: o baguete de calabresa com queijo custa R$ 15,41 por unidade (insumos da receita R$ 61,64 ÷ rendimento 4), recalculado à mão e igual ao valor do banco.
- Nenhuma receita tem unidade incompatível com a do insumo (o que faria o insumo ser ignorado no custo); nenhum insumo usado em receita está sem preço; todo produto tem receita e preço de venda acima do custo.
- Estoque: nenhum insumo com saldo negativo; movimentos de compra, produção e inventário coerentes entre si.

**Pontos de atenção (decisão do proprietário, nada foi alterado)**
- **Custos gravados defasados:** 14 itens de pedidos têm custo gravado mais de 30% abaixo do custo atual (12 em pedidos entregues e 2 em pedidos ainda "recebido", nº 11 e nº 13, com entrega em 30/10). Exemplo: baguete de calabresa, R$ 5,49 gravado contra R$ 15,41 atual. Os custos gravados são retratos e não devem ser recalculados em massa (regra do projeto); a causa provável é receita ou preços diferentes na época do pedido, mas o histórico de alterações não permite confirmar. **Atualizado em 29/10/2026, com autorização do proprietário:** os 2 itens dos pedidos nº 11 e nº 13 (ainda "recebido", sem produção) passaram a usar o custo atual (R$ 15,21 e R$ 15,41); os 12 itens de pedidos entregues continuam com o custo gravado.
- **Custos de gás, energia e mão de obra estão zerados em todos os produtos**, então as margens exibidas (26% a 91%) consideram só os insumos. Decisão do proprietário em 29/10/2026: não preencher agora.
- **Estoque só baixa quando a produção é registrada:** 22 itens de pedidos entregues não têm produção registrada, portanto nunca consumiram insumos e o saldo de estoque fica superestimado. Não é defeito de código; é processo de uso.

**Teste novo:** `tests/db/custos-receitas-smoke.sql` cobre a conversão de unidades, o rendimento, os custos extras e a regra de que o custo gravado no pedido não muda quando o preço do insumo muda (verificado também por mutação: o teste falha se o esperado for alterado).

### 3.7 Etapa E — financeiro (29/10/2026)

Método: leitura das fórmulas de contas a pagar nas telas, consultas somente leitura de consistência em produção e mirror dos testes novos em Node (o Vitest roda no CI).

**Dados de produção (27 contas a pagar):** status e data de cancelamento coerentes (6 canceladas, 5 pagas, 16 pendentes); nenhuma conta paga incompleta, nenhuma pendente com pagamento, nenhuma vencida. O valor pago de todas as contas confere com pagamentos − estornos (as duas contas aparentemente divergentes têm estorno registrado).

**C3 resolvido:** a regra do saldo de conta estava copiada em 4 telas e a definição de "conta em aberto" variava (às vezes só o status, às vezes também a data de cancelamento; o total pago somava status diferentes). Agora há uma única definição em `src/lib/financeiro.ts`, com 10 testes, usada por Financeiro, Contas a pagar, Relatórios e Fluxo de caixa. Com os dados atuais os números exibidos não mudam. Fórmulas descritas em `docs/formulas-financeiras.md`.

**Observação:** "Lucro total do período" (contratado) e "Resultado" (realizado) são indicadores diferentes na mesma tela de Relatórios; agora documentados.

### 3.9 Etapa G — multiempresa, permissões e segurança (29/10/2026)

Método: consultas somente leitura ao catálogo do banco de produção, leitura das funções de servidor e das ferramentas MCP.

**C9 — Leitura por IA só era barrada na tela (corrigido).** O recurso "Leitura por IA" do plano era conferido apenas na interface (`useRecurso("ia")`); a função de servidor `extractOrderDraft` exigia login, mas **não conferia o plano nem a situação da assinatura**. Qualquer usuário autenticado, inclusive de uma conta suspensa ou de plano sem IA, podia chamá-la diretamente e gastar créditos de IA da plataforma (e a regra do projeto diz que verificações no frontend não são barreira de segurança). Agora o servidor consulta `minha_assinatura` e recusa quando o plano não inclui IA, a assinatura está suspensa/cancelada, ou o plano não pôde ser verificado. A regra pura é `podeUsarRecurso` (`src/lib/assinatura.ts`), com teste. Contas sem assinatura (antigas) seguem liberadas, como na tela.

**Verificado sem problema**
- R5 resolvido (ver tabela): as funções `SECURITY DEFINER` restantes são de gatilho ou internas.
- O cliente administrativo (`supabaseAdmin`) só é usado em `push.functions.ts`, com filtros por pedido/confeitaria e janela de 10 minutos; as ferramentas MCP usam o cliente com RLS do chamador.
- Papéis (dono, gerente, produção), RLS por confeitaria, bloqueio por acesso/assinatura e catálogo anônimo continuam cobertos pelos testes de banco (`multiempresa-isolation`, `equipe`, `plataforma`, `catalogo*`, `anonimo-sem-acesso`).

**Não verificável nesta sessão (ação do proprietário)**
- **R6 — backups:** o banco não expõe a configuração de backup e não tenho acesso ao painel do provedor. Não afirmo que existem backups. Antes do piloto: confirmar no painel do Lovable Cloud/Supabase se há backup diário ou recuperação pontual, e **testar uma restauração** em um projeto separado.
- **R7 — dependências:** os alertas de dependências (Dependabot) estão **desativados** no repositório e não é possível rodar auditoria de pacotes aqui. Recomendação: ativar Dependabot alerts nas configurações do GitHub (sem custo, sem mudança de código).
- **R3 — códigos curtos:** sem limite de tentativas nas consultas públicas (ver 3.8); decidir se vale um limite antes de muitos clientes.
- **Isolamento entre confeitarias em produção:** só existe 1 confeitaria em produção; o isolamento é comprovado pelos testes automatizados, não por dados reais de duas contas.

### 3.8 Etapa F — catálogo público e primeiros passos (29/10/2026)

Método: consultas somente leitura em produção (privilégios, políticas, funções chamáveis por visitante anônimo) e leitura das funções do catálogo. Nada foi alterado em produção.

**Verificado em produção**
- O visitante anônimo (papel `anon`) tem privilégio de tabela em 14 tabelas, mas **todas têm RLS ligada e a única política aplicável a anônimos é `planos_leitura`** (preços dos planos, público de propósito). Teste dinâmico (papel `anon`, transação desfeita): 0 linhas em pedidos, clientes, produtos, configurações e `owner_claim`; 3 linhas em planos.
- Funções chamáveis por anônimo: 49. As de catálogo e pedido são `SECURITY DEFINER` com `search_path` fixo e devolvem só dados do pedido consultado, sem custo, receita ou outros clientes. `release_owner_claim` e `limitar_proprietario_unico` são funções de gatilho (não são chamáveis como RPC).
- Código curto do pedido (`pedidos.codigo_curto`): 10 caracteres de um alfabeto de 31, cerca de 49 bits, gerado a partir de UUID aleatório; o link longo usa UUID (122 bits). **Sem limite de tentativas** nas consultas públicas: o risco de adivinhação é baixo com poucos pedidos, mas cresce com a escala (acompanhar na Etapa G). O código mostra nome (primeiro), itens, endereço de entrega e Pix da confeitaria do pedido consultado.
- `progresso_fidelidade` permite a um visitante saber quantos pedidos um telefone informado tem naquela confeitaria (módulo N). É o recurso de fidelidade; risco baixo, registrar para decisão de produto.
- Primeiros passos: 6 passos coerentes e já testados (`primeiros-passos.test.ts`). Em produção: 1 confeitaria, 1 catálogo no ar, 2 pedidos de catálogo em 43, 9 produtos no catálogo, 8 deles sem foto.

**Proteção nova:** `tests/db/anonimo-sem-acesso-smoke.sql` falha se alguma tabela do schema `public` ficar sem RLS, se surgir política para anônimo além de `planos_leitura`, ou se o anônimo conseguir ler linhas de qualquer tabela (verificado por mutação: tabela sem RLS, política vazando e leitura efetiva fazem o teste falhar).

**Recomendação (não aplicada, precisa de autorização):** revogar os privilégios de tabela do papel `anon`, deixando só a RLS e as funções públicas, como defesa em profundidade. Hoje a segurança depende apenas da RLS estar correta (está).

## 4. Pontos fortes confirmados

- RLS por tenant em todas as tabelas, políticas RESTRICTIVE para papel e acesso, e 88 instruções `REVOKE ALL ON FUNCTION` nas migrations.
- Catálogo público acessa apenas RPCs, sem ler tabelas; preços e custos calculados no servidor.
- Operações de estoque e contas a pagar idempotentes, com bloqueios de concorrência.
- Snapshot de custo nos itens de pedido, preservando a lucratividade histórica.
- 20 scripts de teste de banco (19 SQL e 1 de concorrência), todos referenciados em workflows, incluindo isolamento multiempresa, equipe, plataforma, catálogo e recorrências.
- Primeiros passos (`comecar.tsx`), planos/assinaturas, painel de plataforma e monitoramento de erros já existem — não serão recriados.

## 5. Plano priorizado

Nenhum risco **crítico** de segurança ou perda de dados foi confirmado nesta etapa, então a ordem sugerida é mantida. O item C1 foi decidido (manter o merge automático); PRs com código ficam em rascunho até a revisão.

| Etapa | Escopo | Itens desta auditoria |
|---|---|---|
| A (esta) | Auditoria e plano | — |
| B | Navegação: agrupar o menu "Mais" sem remover funções | C4 |
| C | Pedidos, produção, recorrências: conferir R1 e R2 e criar testes de transições, pagamento parcial, edição, cancelamento | R1, R2 |
| D | Produtos, receitas, custos, estoque: auditoria completa e testes | — |
| E | Financeiro: módulo `financeiro.ts` com fórmulas documentadas e testes | C3 |
| F | Catálogo e onboarding: avaliar e simplificar | — |
| G | Multiempresa, permissões e segurança | R3, R4, R5, R6, R7 |
| H | Qualidade: lint completo, regressão, lockfile, piloto | C2, C5, C6, C7 |

## 6. Decisões que dependem do proprietário

Decididas em 29/10/2026:
1. **Merge automático (C1):** mantido.
2. **Registry do lockfile (C7):** sem alteração (origem identificada; ver C7).
3. **Acesso somente leitura ao banco:** autorizado, apenas para consulta, sem alterar dados.

Em aberto:
4. **Custos zerados em pedidos antigos:** corrigir com confirmação item a item, ou manter o histórico como está?
5. **Backups (R6):** verificar na configuração do projeto de banco, que as ferramentas de consulta não expõem.

## 7. Requisitos mínimos para o piloto (rascunho, a ser refinado na Etapa H)

- Fechar C2, e conferir R1 (esquema), R3 e R5.
- Backup verificado e teste de restauração (R6).
- Fórmulas financeiras documentadas e testadas (C3).
- Onboarding e catálogo validados com uma confeitaria nova, sem dados reais misturados.
