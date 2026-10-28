# Plano de evolução — Minhaconfeitaria

> Salvar no repositório como `docs/plano-evolucao.md`.
> Objetivo: deixar o sistema mais completo e simples, transformá-lo em produto para outras confeitarias e criar um catálogo público com pedido, pagamento e alerta.
> Este plano é executado pelo Claude Code, direto no repositório, sem usar o agente do Lovable.

## Regras de trabalho (valem para todas as etapas)

Já estão em `AGENTS.md`. Leia o arquivo inteiro antes de começar.

- **Nunca reescrever o histórico do git**: nada de force push, rebase, amend ou squash de commits já enviados. O Lovable sincroniza com a branch conectada e o projeto perderia o histórico.
- **Uma etapa por branch e por pull request.** A branch principal precisa estar sempre funcionando, porque ela volta para o Lovable.
- **Antes de qualquer migração de banco**: o proprietário faz backup. Teste primeiro com uma migração pequena para confirmar como o Lovable aplica arquivos de `supabase/migrations/` depois do push. Não assumir que são aplicadas sozinhas.
- Existem dois históricos de migração (`drizzle/migrations/` e `supabase/migrations/`) e documentos em `docs/audits/`. Leia-os antes e use o mesmo padrão das migrações mais recentes. Não criar um terceiro padrão.
- Salvar pedidos e itens de receita **somente por RPC transacional** (ver migrações `0011` e `0020` a `0023`). Gravação parcial nunca pode apagar itens anteriores.
- **Preservar o custo congelado nos itens de pedido.** Mudança no preço de insumo não pode alterar o lucro histórico.
- Regras de acesso ficam no banco (RLS). Verificação no frontend não é segurança.
- As ferramentas MCP (`src/lib/mcp/`) continuam com o cliente RLS. Nenhum agente pode burlar o isolamento entre confeitarias.
- Cada etapa termina com: testes passando (`package.json` e `.github/workflows/quality.yml`), `roadmap.md` atualizado e `AGENTS.md` atualizado se uma regra mudou.
- Quando houver decisão do proprietário (marcadas com **DECISÃO**), parar e perguntar antes de implementar.

---

## Etapa 1 — Dados, pagamento e custos

> **Situação (PR da Etapa 1):** feitos sem migração de banco — selo único de pagamento (Pago / Sinal pago / Pagamento pendente), botão "Cobrar" no WhatsApp para pedidos entregues com saldo, alerta de margem com preço sugerido (produtos e itens de pedido), aviso de item sem custo registrado, "Repetir pedido" e aviso de cliente sem telefone.
> Ao ler o código, dois pontos já estavam resolvidos: o saldo já é calculado a partir do histórico de recebimentos (`calcularRecebimentoPedido`) e a lista de pedidos já tem o filtro "A receber"; o menu do celular já tem 5 abas (Painel, Pedidos, Produção, Clientes, Mais), por isso não foi reorganizado.
> Pendentes por dependerem de decisão ou de migração: 1.3 (custos indiretos), correção de itens com custo zero (1.5), etiquetas de preferências (1.6) e entrega por item (1.8).

Objetivo: o sistema mostrar números confiáveis e ficar mais simples, sem mudar a arquitetura.

### 1.1 Status de pagamento único
- **Problema:** hoje `valor_entrada` e `saldo_quitado` juntos definem se o pedido está pago. Há pedidos entregues com entrada igual ao total e `saldo_quitado = false`.
- Primeiro, ler a lógica atual (migrações `0018`, `0019`, `0028`, `0031` e a tela `pedidos.$id.tsx`) para entender o que cada campo significa de fato.
- Mostrar um status derivado: **Pendente / Sinal pago / Pago**, calculado a partir do histórico de recebimentos.
- Manter os campos antigos por compatibilidade. Não quebrar relatórios nem as ferramentas MCP.
- Teste: pedido com entrada parcial, entrada total, quitado depois, e estorno.

### 1.2 Contas a receber
- Lista de pedidos entregues com saldo em aberto, em ordem de atraso. Mostrar o total no painel.
- Botão "cobrar no WhatsApp" que abre `wa.me` com mensagem pronta. Reaproveitar o padrão de `src/components/app/order-message.tsx`.

### 1.3 Custos indiretos
- **Problema:** gás, energia e mão de obra estão em R$ 0 em todos os produtos.
- Criar uma configuração geral em `configuracoes` (por exemplo, custo por hora de forno e de mão de obra, ou percentual sobre o custo dos insumos). **DECISÃO:** qual modelo o proprietário prefere.
- Usar essa configuração no cálculo de custo (`src/lib/calc.ts`), com testes em `calc.test.ts`.
- Não alterar os custos congelados dos pedidos antigos.

### 1.4 Alerta de margem
- Em produtos, comparar o preço de venda com `margem_desejada`. Mostrar aviso e o **preço sugerido** quando estiver abaixo.
- Em pedidos, avisar quando o preço de um item for editado para abaixo do custo ou da margem mínima.
- Preços editados por linha devem poder registrar o motivo (hoje o campo `desconto` quase não é usado).

### 1.5 Itens de pedido com custo zerado ou inconsistente
- **Problema:** há itens com `custo_unitario = 0` e o mesmo produto com custos diferentes entre pedidos.
- Criar uma tela de revisão que lista só os itens com custo zero.
- Corrigir **apenas** itens com custo zero, depois que o proprietário confirmar. Não recalcular itens que já têm custo, por causa da regra do custo congelado.
- Listar também as receitas que parecem incomuns para o proprietário conferir (por exemplo, o bolo de chocolate usa 50 g de fermento químico e os outros bolos usam 15 g). **Não alterar receitas automaticamente.**

### 1.6 Cadastro de clientes
- Telefone obrigatório em novos clientes (aviso, sem travar os existentes).
- Preferências do cliente como etiquetas, em vez de texto livre.
- Botão "repetir pedido" no histórico do cliente.

### 1.7 Navegação mais simples
- Reduzir as cerca de 14 telas para 5 abas: Início, Pedidos, Produção, Produtos (com insumos) e Financeiro (com Compras, Contas a pagar e Despesas como sub-abas).
- Manter as URLs antigas redirecionando, para não quebrar links salvos.

### 1.8 Entrega por item ou por data (opcional, avaliar o custo)
- Hoje pedidos com entregas em datas diferentes usam o campo de observações. Avaliar dividir o pedido em duas entregas.

---

## Etapa 2 — Várias confeitarias (multi-tenant)

Objetivo: permitir que outras confeitarias usem o sistema, cada uma isolada das demais.

**Atenção:** hoje a regra é **proprietário único**. Existe um gatilho (`limitar_proprietario_unico`) que impede qualquer cadastro depois do primeiro, e todas as tabelas filtram por `user_id`. Esta etapa muda uma regra do `AGENTS.md` e precisa atualizá-la.

Seguir o método "expandir, preencher, depois restringir", nunca trocar tudo de uma vez:

1. **Criar** `confeitarias` (id, nome, `slug` único, logo, cores) e `membros` (confeitaria, usuário, papel: dono ou funcionário).
2. **Adicionar** `confeitaria_id` (aceitando nulo) em todas as tabelas: `clientes`, `insumos`, `produtos`, `receita_itens`, `pedidos`, `pedido_itens`, `despesas`, `configuracoes` e as tabelas criadas depois (compras, estoque, contas a pagar, recebimentos, pedidos recorrentes).
3. **Preencher**: criar a confeitaria da dona atual e ligar todos os registros existentes a ela. Conferir contagens antes e depois.
4. **Trocar as políticas RLS** para checar se o usuário é membro da confeitaria, usando uma função auxiliar `security definer` e `stable`. Manter `user_id` até tudo estar verificado.
5. **Atualizar as RPCs** que hoje usam `auth.uid()` como dono (salvar pedido, receita, compras, produção, inventário etc.) e o `src/lib/mcp/supabase.ts` e as ferramentas MCP.
6. **Remover o gatilho de proprietário único.** Substituir por um fluxo de cadastro que cria a confeitaria e o primeiro membro.
7. **Passo a passo inicial** para quem se cadastra (nome, WhatsApp, taxas, primeiros produtos) e dados de exemplo opcionais.
8. **Testes de isolamento**: duas confeitarias de teste, e cada uma não pode ler nem alterar dados da outra, inclusive pelas RPCs e pelas ferramentas MCP.
9. Atualizar o `AGENTS.md` (regra de propriedade) e o `roadmap.md`.

---

## Etapa 3 — Catálogo com pedido, pagamento e alerta

Objetivo: o cliente vê os produtos, faz o pedido e paga. O sistema cadastra a venda e avisa a confeitaria.

Depende da Etapa 2, porque o catálogo é por confeitaria (`/c/<slug>`).

### 3.1 Dados
- Em `produtos`: `descricao`, `imagem_url` (bucket de storage), `no_catalogo` (boolean), `antecedencia_horas`, `limite_diario` (opcional), variações (tamanho e sabor) se forem necessárias.
- Tabela de configurações do catálogo: ligado ou desligado, horários, retirada e entrega, áreas e taxas de entrega, percentual de sinal, formas de pagamento, WhatsApp da loja.
- Novo status de pedido **`aguardando_pagamento`** (e `expirado`), incluído na restrição de status como nas migrações anteriores de status.
- `token_publico` no pedido, para a página de acompanhamento.

### 3.2 Páginas públicas (fora do layout autenticado)
- `/c/$slug`: catálogo para celular, com categorias, foto, preço, carrinho e finalização.
- `/pedido/$token`: acompanhamento do pedido.
- Finalização: nome, WhatsApp, retirada ou entrega (usando `taxa_entrega`), data e horário respeitando antecedência e limite diário.

### 3.3 Segurança (obrigatório)
- **Não abrir as tabelas para visitantes anônimos.** Expor somente:
  - uma função ou view `catalogo_publico(slug)` que devolve só produtos ativos e visíveis, com campos seguros (nada de custo, receita ou margem);
  - uma RPC `criar_pedido_catalogo` que valida tudo no servidor: produtos ativos e no catálogo, **preço recalculado no servidor** (nunca confiar no preço enviado pelo navegador), antecedência, limite diário, taxa de entrega, cliente criado ou atualizado pelo telefone.
- Proteção contra abuso: limite de pedidos por telefone e por IP, campo oculto anti-robô ou captcha.
- Tratar os dados pessoais dos clientes conforme a LGPD.
- Testes: tentar criar pedido com preço alterado, produto de outra confeitaria, quantidade negativa, data inválida.

### 3.4 Pagamento
- **DECISÃO:** gateway (Mercado Pago, Asaas, Stripe, outro) e se haverá sinal ou pagamento total. Cada confeitaria deve receber **na própria conta**: conectar a conta do gateway dela. O sistema não deve movimentar o dinheiro de terceiros.
- Fluxo com Pix: gerar cobrança (QR e "copia e cola") no servidor, mostrar na tela, e receber a confirmação por **webhook**.
- Webhook em rota pública de servidor: verificar a assinatura, ser idempotente (o mesmo aviso duas vezes não pode registrar dois pagamentos) e confirmar o valor.
- Ao confirmar: registrar o recebimento pelo mecanismo de recebimentos que já existe, mudar o pedido para `recebido` e disparar o alerta.
- Cobrança sem pagamento expira depois de um tempo e libera o horário.
- Chaves e segredos só em variáveis de ambiente do servidor, nunca no código ou no navegador.
- Cartão fica para uma fase posterior.

### 3.5 Alerta de pedido novo
- Atualização em tempo real na lista de pedidos (Supabase Realtime), com contador e som.
- Notificação no celular (PWA) e e-mail para a confeitaria.
- WhatsApp: **DECISÃO** entre a API oficial (tem custo) e um botão que abre a conversa com mensagem pronta.

### 3.6 Testes
- Fluxo completo: catálogo, carrinho, pedido, cobrança, webhook, pedido em "recebido", alerta.
- Teste de isolamento: o catálogo de uma confeitaria nunca mostra dados de outra.

---

## Etapa 4 — Produto vendável

- Planos e assinatura (Asaas, Stripe ou Mercado Pago), com período de teste e bloqueio gentil quando vencer. **DECISÃO:** preços e limites de cada plano.
- Página de apresentação do produto e cadastro.
- Termos de uso, política de privacidade e contrato.
- Exportação dos dados da confeitaria (CSV) e exclusão de conta.
- Domínio próprio e e-mail de suporte.
- Painel do administrador (você) para ver confeitarias, planos e problemas, sem ver dados financeiros dos clientes além do necessário.

---

## Ordem e critérios de pronto

| Etapa | Pronto quando |
|---|---|
| 1 | Status de pagamento único, contas a receber, custos indiretos, alerta de margem e menu de 5 abas funcionando e testados |
| 2 | Duas confeitarias de teste isoladas, cadastro novo funcionando, dados da dona atual intactos e conferidos |
| 3 | Pedido feito no catálogo e pago por Pix aparece sozinho como "recebido", com alerta |
| 4 | Uma confeitaria nova consegue se cadastrar, testar e assinar sem ajuda sua |
