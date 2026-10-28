# Implantação: catálogo online (migração 0034)

## O que a migração faz
- Produtos: `descricao`, `imagem_url`, `no_catalogo` (padrão: não aparece) e `antecedencia_dias` (padrão: 1).
- Confeitarias: liga/desliga do catálogo, retirada/entrega, taxa de entrega, pedido mínimo, endereço de retirada, aviso e limite de pedidos por dia.
- Pedidos: `origem` (`manual`/`catalogo`), código público, token de idempotência, tipo e endereço de entrega, `visualizado_em` e `pagamento_informado_em`.
- Quatro funções públicas: `catalogo_publico`, `criar_pedido_catalogo`, `acompanhar_pedido_catalogo` e `informar_pagamento_catalogo`.
- Bucket público `catalogo` para fotos; cada conta só grava na própria pasta.
- Garante a coluna `configuracoes.pix_chave`, que já existe em produção.
- Não altera nenhum pedido, item, pagamento ou produto existente. Todos os pedidos atuais ficam com `origem = 'manual'` e nenhum produto entra no catálogo até a dona marcar.

Assim como a `0033`, a `0034` fica fora do `_journal.json` e é aplicada diretamente (idempotente e transacional).

## Passo a passo
1. Backup do banco.
2. Executar `drizzle/migrations/0034_catalogo_publico.sql`.
3. Conferir:
   ```sql
   select count(*) filter (where origem = 'manual') as manuais, count(*) as total from public.pedidos;
   select count(*) from public.produtos where no_catalogo;          -- 0
   select id, public from storage.buckets where id = 'catalogo';    -- public = true
   select public.catalogo_publico('nao-existe');                    -- null
   ```
4. Merge do PR. Em Configurações → Catálogo online: definir o endereço, ativar e marcar os produtos.
