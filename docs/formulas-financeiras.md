# Fórmulas financeiras do Doce Gestão

Valores em reais. Onde a fórmula está em código puro e testado, o arquivo é indicado. Este documento descreve o que o sistema **calcula hoje**; não propõe mudanças.

## Pedidos (`src/lib/calc.ts`, `src/lib/hooks.ts`)

| Indicador | Fórmula |
|---|---|
| Subtotal | soma de quantidade × preço unitário dos itens |
| Venda do pedido | max(0, subtotal + taxa de entrega − desconto) |
| Custo do pedido | soma de quantidade × **custo unitário gravado no item** (retrato do momento do pedido; não muda quando o preço do insumo muda) |
| Taxas | venda × (taxa da forma de pagamento + imposto) ÷ 100 |
| Lucro bruto | venda − custo |
| Lucro líquido | lucro bruto − taxas |
| Recebido | o maior entre o valor pago cadastrado (limitado à venda), a soma de `pedido_pagamentos` e, se o pedido está quitado, a venda inteira (`calcularRecebimentoPedido`) |
| Saldo a receber | 0 se o pedido está cancelado ou quitado; senão max(0, venda − recebido) |

## Contas a pagar (`src/lib/financeiro.ts`, usado por Financeiro, Contas a pagar, Relatórios e Fluxo de caixa)

| Indicador | Fórmula |
|---|---|
| Conta ativa | não cancelada (`cancelada_em` vazio e status diferente de "cancelado") |
| Conta em aberto | ativa e com status "pendente" ou "parcial" |
| Saldo da conta | max(0, valor − valor pago), em centavos. O valor pago já é **líquido de estornos** (pagamentos − estornos) |
| Conta vencida | em aberto e com vencimento **anterior** a hoje |
| Total em aberto / vencido | soma dos saldos das contas em aberto / vencidas |
| Total pago | soma do valor pago das contas ativas |

## Relatórios (`relatorios.tsx`)

- **Contratado** (pedidos não cancelados do período): venda, recebido e saldo somados.
- **Realizado** (pedidos "entregue" ou "finalizado" do período): venda, custo e taxas somados.
- **Lucro bruto / margem bruta**: venda realizada − custo realizado; margem = lucro bruto ÷ venda realizada.
- **Resultado** (realizado): lucro bruto − taxas − despesas do período.
- **Lucro total do período** (contratado): venda contratada − custos − taxas − despesas do período. É um indicador **diferente** do Resultado: inclui pedidos ainda não entregues.
- **Despesas**: soma das despesas lançadas no período. Compras de insumos e contas a pagar aparecem como informação e **não** são subtraídas de novo, porque o custo dos insumos já está no custo dos itens.
- Custos de gás, energia e mão de obra do produto, quando preenchidos, entram no custo unitário do produto (hoje estão zerados).

## Pontos a ter em mente
- Há duas fórmulas de "recebido" no código (`totaisPedido` e `calcularRecebimentoPedido`); a segunda considera o histórico de pagamentos e é a usada pelos relatórios (risco R2 da auditoria, sem divergência nos dados atuais).
- Contratado e Realizado respondem perguntas diferentes; os dois aparecem em Relatórios com nomes distintos.
