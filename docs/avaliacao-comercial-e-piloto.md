# Avaliação comercial e preparo do piloto — Doce Gestão

Data: 29/10/2026. Base: auditoria em `docs/auditoria-e-plano-de-melhorias.md` (etapas A a H), consultas somente leitura ao banco de produção e testes de banco executados em um PostgreSQL de teste. Onde algo **não foi verificado**, está dito.

## 1. Resumo

O sistema está **tecnicamente pronto para um piloto pequeno e acompanhado** (2 a 3 confeitarias, com suporte direto), desde que os itens da seção 4 sejam cumpridos antes. Não está pronto para abertura ampla de cadastro: o isolamento entre confeitarias é bem protegido e testado, mas só existe **uma confeitaria real em produção**, então ele nunca foi exercitado com dados reais de várias contas, e a recuperação de desastre (backup) **não foi verificada**.

## 2. Pontos fortes (confirmados)

- **Isolamento entre confeitarias:** toda tabela tem proteção por linha (RLS) por confeitaria; o visitante anônimo do catálogo não lê nenhuma tabela (verificado em produção e agora travado por teste automático). Funções sensíveis são conferidas por confeitaria.
- **Dados históricos protegidos:** o custo gravado em cada item do pedido não muda quando o preço do insumo muda (teste automático); gravações de pedido e receita são transacionais, sem perder itens em falha parcial.
- **Cálculo de custo correto e conferido:** a fórmula foi recalculada à mão e bate com o banco. Estoque sem saldos negativos; contas a pagar coerentes com o histórico de pagamentos e estornos.
- **Recursos de produto para venda:** catálogo público com Pix, planos e assinaturas com limites e recursos, papéis de equipe (dona, gerente, produção), notificações push, painel de administração separado, monitoramento de erros, lista de "primeiros passos".
- **Qualidade automatizada:** o CI roda tipos, testes, build e **21 testes de banco** (contando os PRs desta auditoria que ainda aguardam mesclagem); a partir desta auditoria o lint cobre todo o código. Há regras documentadas no `AGENTS.md`.

## 3. Riscos (ordenados)

| # | Risco | Situação | Quem resolve |
|---|---|---|---|
| 1 | **Backups e restauração não verificados** | Não consigo ver nem testar a configuração do provedor. Perder dados de clientes pagantes é o pior cenário | Proprietário (painel do provedor) |
| 2 | **Uma única confeitaria real em produção** | O isolamento está provado por testes, não por uso real de várias contas | Piloto acompanhado |
| 3 | **Processo de migrações manual** | O histórico oficial de migrações do banco tem 29 registros contra 51 arquivos; as migrações novas são aplicadas à mão. Funciona, mas depende de cuidado e documento (`docs/reconciliar-historico-migracoes.md`) | Equipe técnica |
| 4 | **Dependências sem monitoramento** | Os alertas de vulnerabilidade (Dependabot) estão desativados no repositório | Proprietário (ativar nas configurações do GitHub) |
| 5 | **Sem limite de tentativas** em consultas públicas (links curtos de pedido) e na leitura por IA (agora só por plano, não por volume) | Risco baixo hoje; cresce com a escala e com custo de IA | Etapa futura |
| 6 | **Regras de pedido só no código da tela** | Não há regra central de transição de status; a passagem automática para "em produção" só roda quando alguém abre o app | Etapa futura |
| 7 | **Margens aparentes** | Gás, energia e mão de obra estão zerados nos produtos, então as margens mostradas consideram só insumos (decisão do proprietário: não preencher agora) | Proprietário |
| 8 | **Estoque depende de registrar produção** | Itens entregues sem produção registrada não baixam insumos (22 itens hoje) | Processo de uso / treinamento |
| 9 | **Interface não validada nesta auditoria** | Nenhuma tela foi aberta num navegador; as verificações foram de código, banco e CI | Teste manual no piloto |
| 10 | **Aspectos jurídicos** | Existem páginas de termos e privacidade, mas a revisão jurídica (LGPD: nomes, telefones e endereços de clientes) não foi avaliada | Proprietário/jurídico |

## 4. Essencial antes do primeiro piloto

1. **Backup:** confirmar no painel do provedor que há backup automático (diário ou recuperação pontual) e **testar uma restauração** em projeto separado. Registrar o resultado.
2. **Ativar Dependabot alerts** no GitHub e tratar os alertas críticos.
3. **Fixar o procedimento de migrações do piloto:** aplicar uma de cada vez, com conferência antes e depois (como foi feito com a `0047`), e manter a lista do que já está aplicado em produção.
4. **Ensaiar o cadastro de uma confeitaria nova** de ponta a ponta (cadastro fechado por padrão e aprovação manual; liberar a conta no painel de administração, concluir "Primeiros passos", cadastrar insumos e um produto com receita, fazer um pedido e abrir o catálogo no celular), em conta de teste sem dados reais.
5. **Revisar termos e política de privacidade** com quem entende de LGPD antes de cadastrar clientes de terceiros.
6. **Definir o suporte do piloto:** canal (WhatsApp), horário e quem responde; combinar com as donas que os erros de tela são registrados pelo próprio sistema.
7. **Treinar o hábito de registrar a produção** (baixa de estoque) e de registrar recebimentos pelo histórico de pagamentos, não editando o valor pago direto.

## 5. O que pode esperar

- Formatação automática do código (Prettier) e a limpeza dos 22 avisos de lint.
- Divisão das telas grandes (`compras`, `relatorios`, `pedidos.$id`, `producao`, `contas-pagar`) em módulos menores.
- Troca do endereço de download de pacotes do lockfile (sem efeito no sistema em execução).
- Regra única de transição de status e passagem automática para "em produção" feita no servidor.
- Limite de tentativas nas consultas públicas; revogação dos privilégios de tabela do papel anônimo (a RLS já bloqueia).
- Numeração de pedidos por confeitaria (hoje é uma sequência global; só cosmético).
- Testes dos 11 módulos de `src/lib` ainda sem cobertura.

## 6. Critérios para escolher as primeiras confeitarias

- **2 a 3 confeitarias**, de perfis diferentes (uma que vende só por encomenda pelo WhatsApp, outra com catálogo e recorrentes).
- Donas dispostas a dar retorno semanal e a usar o sistema de verdade por pelo menos 4 semanas.
- Volume que exercite o sistema sem exigir escala: de 10 a 40 pedidos por semana.
- Comece com produtos e receitas já definidos, para validar custos e margens logo na primeira semana.
- Sem dependência de integração de pagamento automática: a cobrança de mensalidades é manual (assinaturas só mudam por funções de administração).

## 7. Indicadores de prontidão (acompanhar no piloto)

| Indicador | Meta sugerida | Onde ver |
|---|---|---|
| Cadastro até o primeiro pedido | menos de 1 dia | histórico / "Primeiros passos" |
| "Primeiros passos" concluídos | 6 de 6 na primeira semana | tela Hoje |
| Pedidos registrados por semana por confeitaria | cresce semana a semana | painel de administração (métricas) |
| Parcela de pedidos pelo catálogo | acompanhar (hoje 2 de 43) | painel de administração |
| Erros de tela por semana | tendendo a zero; sem erro repetido | painel de administração (erros) |
| Divergência entre valor pago e histórico de pagamentos | zero | consulta de conferência |
| Produtos com receita e custo | 100% dos vendidos | tela de produtos |
| Pedidos entregues sem produção registrada | caindo | consulta de conferência |
| Retorno das donas sobre o que travou | resolvido em até 2 dias úteis | suporte |
| Risco de cancelamento (regra da plataforma) | nenhuma conta em risco | painel de administração |

## 8. Resumo das etapas

| Etapa | Entrega | PR |
|---|---|---|
| A | Auditoria e plano | #209, #211 |
| B | Menu "Mais" agrupado, fonte única | #210 |
| C | `salvar_pedido` preserva recebimentos (aplicada em produção) | #212 |
| D | Teste da fórmula de custo; auditoria de custos e estoque | #213 |
| E | Fórmulas de contas a pagar em módulo único e testado | #214 |
| F | Teste de acesso anônimo; auditoria do catálogo | #215 |
| G | Leitura por IA confere plano no servidor | #216 |
| H | Lint em todo o código; testes de módulos de formatação | #217, #218 |
| Fechamento | Este documento | #219 |
