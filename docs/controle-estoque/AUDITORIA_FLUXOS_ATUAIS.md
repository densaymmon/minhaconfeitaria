# Auditoria dos fluxos existentes antes da integração do estoque

## Compras

Arquivo: `src/routes/_authenticated/compras.tsx`.

O fluxo atual grava diretamente em `compras` e `compra_itens`:
- Compra nova: insere cabeçalho e depois todos os itens em uma chamada separada.
- Edição: atualiza o cabeçalho, atualiza/insere itens um por um e apaga itens removidos em outra chamada.
- Se a gravação falhar no meio da edição, parte das alterações anteriores pode já ter sido persistida.
- Na criação, o catch tenta apagar o cabeçalho para compensar falha de itens, mas isso não é substituto de uma transação.
- A exclusão/edição dos itens precisa ser integrada à movimentação por compensações; não adicionar trigger que simplesmente some compras, porque alterações e remoções duplicariam ou deixariam saldo incorreto.

**Requisito para a próxima implementação:** substituir o conjunto de gravações por uma única RPC transacional que valida proprietário, compra e insumos, calcula os movimentos-base e grava a compra e o ledger atomicamente. A RPC deve preservar os IDs dos itens mantidos e gerar compensações para itens alterados/removidos. A tela deve invalidar compras, itens e saldo apenas depois do sucesso.

## Produção

Arquivo: `src/routes/_authenticated/producao.tsx`.

A tela permite ajustar `quantidade_produzida` em incrementos e decrementos. O fluxo atual grava a quantidade produzida por item; a edição de pedido chama `salvar_pedido`, que apaga e recria `pedido_itens`.

**Requisito para a próxima implementação:** a atualização da quantidade produzida deve passar por uma RPC transacional. Ela deve bloquear o item/pedido, calcular somente a diferença entre a quantidade produzida anterior e a nova, consolidar o consumo por insumo e inserir os movimentos de todos os insumos na mesma transação da atualização. Se qualquer validação falhar, nada pode ser gravado. Não usar o ID do `pedido_item` como chave vitalícia, pois esse ID muda quando o pedido é salvo novamente.

Antes de habilitar baixa automática, a edição de pedido deve preservar a relação entre os itens antigos e o histórico de produção, ou registrar uma reconciliação explícita. Não permitir que a recriação de itens apague ou duplique consumo já contabilizado.

## Conversões de unidade

As funções atuais `medida_base` e `medida_fator` aceitam `pacote` como dimensão separada, com fator 1. Isso **não** converte o pacote para gramas, mililitros ou unidades do conteúdo. A movimentação de pacote só pode ser aceita quando houver conteúdo e unidade de conteúdo explicitamente definidos; caso contrário, bloquear a movimentação e orientar o usuário a configurar a embalagem. Nunca inferir densidade para converter peso em volume.

A unidade-base deve seguir a dimensão real do insumo e a quantidade usada na receita. Compras antigas não entram automaticamente no ledger: primeiro deve existir inventário físico confirmado.

## Critérios de aceite antes de retirar o rótulo de rascunho

- [ ] Compra nova, edição, inclusão/remoção de linha e exclusão integral funcionam atomicamente.
- [ ] A repetição de uma mesma chamada não duplica movimentos.
- [ ] Alterar/remover compra produz movimentos compensatórios, sem modificar o histórico original.
- [ ] Produção parcial baixa somente a diferença; reduzir a quantidade produzida estorna a diferença.
- [ ] Editar pedido não perde o vínculo histórico nem duplica baixa.
- [ ] Receitas com mais de uma linha para o mesmo insumo são agregadas por insumo antes de gravar.
- [ ] Conversões kg/g, L/ml e dúzia/unidade têm testes; pacote sem conteúdo conhecido é rejeitado.
- [ ] RLS impede leitura cruzada e clientes não conseguem inserir/alterar/apagar diretamente movimentos.
- [ ] Falha deliberada em qualquer etapa reverte a transação inteira.
- [ ] Testes executados em ambiente isolado e resultado documentado.

## Limite desta auditoria

Este documento registra riscos encontrados no código e requisitos de implementação. Não altera as telas existentes, não aplica SQL e não habilita movimentações no banco ativo.
