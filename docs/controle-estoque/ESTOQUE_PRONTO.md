# Estoque de produtos prontos

Para a sobra de produção: bolos, pães etc. que foram feitos e não saíram em nenhum pedido. As unidades ficam contadas como "prontas", os insumos são descontados na hora e, quando chega um pedido desse produto, ele pode usar o que já está pronto em vez de produzir de novo.

Migração: `drizzle/migrations/0049_estoque_produtos_prontos.sql`. Teste: `tests/db/estoque-pronto-smoke.sql`.

## Como se usa

| Situação | O que acontece |
|---|---|
| **Produção → Estoque → Registrar produção** (produto + quantidade) | Soma ao estoque pronto e baixa os insumos da ficha técnica (receita × quantidade ÷ rendimento). Exige o recurso `estoque` do plano. |
| **Pedido manual** | Em cada item aparece "Usar do estoque pronto (N disponível)". A pessoa escolhe: marcado, o item sai do estoque pronto (só o que existir; o resto fica para produzir); desmarcado, produz normalmente. |
| **Pedido do catálogo** | Automático: ao receber o pedido, itens iguais ao produto (sem variação escolhida) usam o que houver pronto. Itens com variação (descrição diferente do nome do produto) não usam, porque o estoque pronto é por produto. |
| **Reduzir a produção de um item** (Produção) | Primeiro estorna os insumos do que foi produzido para o pedido; só depois devolve ao estoque pronto o que veio dele. |
| **Cancelar o pedido** | Devolve ao estoque pronto as unidades que o pedido tinha retirado. Pedido entregue/finalizado/perdido não devolve. |
| **Descartar** | Perda (estragou, doou, consumo próprio). Sai do estoque pronto; os insumos **não** voltam. |
| **Desfazer produção** | Só enquanto todas as unidades daquela produção ainda estão no estoque. Estorna os insumos por movimentos compensatórios. |

## Regra central: insumos nunca são baixados duas vezes

Os insumos saem **uma vez só**: quando a produção é registrada para o estoque, ou quando o item do pedido é produzido (`ajustar_producao`). Unidades que vêm do estoque pronto entram no item como produzidas (`quantidade_produzida`) e ficam marcadas em `pedido_itens.quantidade_do_estoque`, sem nova baixa de insumos. Por isso `ajustar_producao` só estorna insumos da parte própria (`quantidade_produzida - quantidade_do_estoque`).

## Tabelas e funções

- `produtos_prontos (user_id, produto_id, quantidade)`: saldo atual, nunca negativo.
- `produtos_prontos_movimentos`: histórico só de acréscimo (`producao`, `uso_pedido`, `devolucao_pedido`, `descarte`, `estorno_producao`), sem chave estrangeira para sobreviver à exclusão de produto/pedido. `evento_id` único por confeitaria garante idempotência.
- Navegador só lê as tabelas; escreve pelas funções: `registrar_producao_estoque`, `descartar_estoque_pronto`, `desfazer_producao_estoque`, `usar_estoque_pronto_item`, e internas (`_mover_estoque_pronto`, `_alocar_estoque_pronto_item`, `_usar_estoque_pronto_catalogo`).
- `salvar_pedido` aceita `usar_estoque: true` por item. `criar_pedido_catalogo` chama `_usar_estoque_pronto_catalogo` (falha ali nunca derruba o pedido do cliente). Trigger `trg_devolver_estoque_pronto` trata o cancelamento. Trigger `trg_produto_bloquear_exclusao_estoque_pronto` impede excluir produto com unidades prontas.
- Segurança: tudo filtrado por `_tenant()`, RLS por confeitaria e política `acesso_liberado`; `anon` não tem privilégio nenhum.

## Limites conhecidos

- O estoque pronto é por produto, não por variação (`opcoes`) nem por componente de kit.
- A prévia de insumos ao registrar produção usa só a ficha técnica do próprio produto (kits não expandem componentes, como no resto do sistema).
- Custos de pedidos antigos não são recalculados; o custo do item continua sendo o snapshot do pedido.
- Pedido já com produção registrada não aceita trocar itens pela tela (regra anterior); para devolver ao estoque pronto, reduza a produção do item em **Produção** ou cancele o pedido.

## Aplicação em produção

Aditiva (tabelas/coluna novas, funções substituídas por versões compatíveis). Aplicar manualmente, como as demais, e conferir depois: criar o item, registrar 1 produção de um produto com receita, ver o saldo de insumos cair e a unidade aparecer em Produção → Estoque. Reversão: não há perda de dados ao deixar de usar; para remover, restaurar `salvar_pedido` (0047), `ajustar_producao` (0006/0043) e `criar_pedido_catalogo` (0044) e então descartar as tabelas novas.
