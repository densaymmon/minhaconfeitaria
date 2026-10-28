# Implantação: fotos/vídeos, links curtos e confirmação no WhatsApp (migração 0035)

- `produto_midias`: até 10 fotos e vídeos por produto (RLS por dona); `salvar_midias_produto` grava a lista e atualiza a capa.
- Bucket `catalogo`: limite passa a 50 MB e aceita vídeos MP4, WebM e MOV.
- `public._slug_reservado()` e restrição em `confeitarias.slug`: nomes de páginas do sistema não podem ser endereço de catálogo.
- `pedidos.codigo_curto` (10 caracteres, gerado por gatilho em pedidos do catálogo) e `pedidos.confirmacao_enviada_em`.
- Funções públicas `pedido_publico(text)`, `informar_pagamento_pedido(text)` e `codigo_curto_pedido(uuid)`; `catalogo_publico` passa a devolver as mídias.
- Não altera pedidos, itens, pagamentos ou produtos existentes.

Aplicação: backup → executar `drizzle/migrations/0035_midias_links_curtos_whatsapp.sql` (fora do `_journal.json`, idempotente) → merge.
