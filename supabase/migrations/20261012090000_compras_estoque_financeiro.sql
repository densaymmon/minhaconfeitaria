-- Compras e estoque do Doce Gestao
create table if not exists public.compras (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid(),
 fornecedor text,
 data_compra date not null default current_date,
 numero_documento text,
 chave_nfe text,
 origem text not null default 'manual' check (origem in ('manual','xml','pdf','foto')),
 status text not null default 'registrada' check (status in ('rascunho','registrada','cancelada')),
 subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
 desconto numeric(12,2) not null default 0 check (desconto >= 0),
 frete numeric(12,2) not null default 0 check (frete >= 0),
 total numeric(12,2) not null default 0 check (total >= 0),
 observacoes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,chave_nfe)
);
create table if not exists public.compra_itens (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid(),
 compra_id uuid not null references public.compras(id) on delete cascade,
 insumo_id uuid references public.insumos(id) on delete set null,
 descricao text not null,
 quantidade numeric(14,4) not null check (quantidade > 0),
 unidade text not null default 'un',
 preco_unitario numeric(12,4) not null default 0 check (preco_unitario >= 0),
 desconto numeric(12,2) not null default 0 check (desconto >= 0),
 total numeric(12,2) not null default 0 check (total >= 0),
 quantidade_base numeric(14,4) not null default 0 check (quantidade_base >= 0),
 unidade_base text not null default 'un',
 created_at timestamptz not null default now()
);
create table if not exists public.contas_pagar (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid(),
 compra_id uuid references public.compras(id) on delete set null,
 descricao text not null,
 fornecedor text,
 data_emissao date not null default current_date,
 data_vencimento date not null default current_date,
 valor numeric(12,2) not null check (valor >= 0),
 valor_pago numeric(12,2) not null default 0 check (valor_pago >= 0 and valor_pago <= valor),
 data_pagamento date,
 forma_pagamento text,
 status text not null default 'pendente' check (status in ('pendente','parcial','pago','cancelado')),
 observacoes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.estoque_movimentos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid(),
 insumo_id uuid not null references public.insumos(id) on delete restrict,
 compra_item_id uuid references public.compra_itens(id) on delete set null,
 tipo text not null check (tipo in ('entrada','consumo','perda','ajuste')),
 quantidade numeric(14,4) not null check (quantidade > 0),
 unidade text not null,
 custo_total numeric(12,2) not null default 0 check (custo_total >= 0),
 data_movimento date not null default current_date,
 origem text not null default 'manual',
 referencia_id uuid,
 observacoes text,
 created_at timestamptz not null default now()
);
create table if not exists public.importacoes_notas (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid(),
 nome_arquivo text not null,
 tipo_arquivo text not null check (tipo_arquivo in ('xml','pdf','foto')),
 chave_nfe text,
 status text not null default 'pendente' check (status in ('pendente','em_conferencia','importada','erro','duplicada')),
 dados_extraidos jsonb not null default '{}'::jsonb,
 erro text,
 compra_id uuid references public.compras(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(user_id,chave_nfe)
);
create index if not exists compras_user_data_idx on public.compras(user_id,data_compra desc);
create index if not exists compra_itens_compra_idx on public.compra_itens(user_id,compra_id);
create index if not exists contas_pagar_vencimento_idx on public.contas_pagar(user_id,data_vencimento);
create index if not exists estoque_insumo_idx on public.estoque_movimentos(user_id,insumo_id,data_movimento);
create index if not exists importacoes_notas_data_idx on public.importacoes_notas(user_id,created_at desc);
alter table public.compras enable row level security;
alter table public.compra_itens enable row level security;
alter table public.contas_pagar enable row level security;
alter table public.estoque_movimentos enable row level security;
alter table public.importacoes_notas enable row level security;
drop policy if exists "compras por usuario" on public.compras;
create policy "compras por usuario" on public.compras for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "itens compra por usuario" on public.compra_itens;
create policy "itens compra por usuario" on public.compra_itens for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "contas pagar por usuario" on public.contas_pagar;
create policy "contas pagar por usuario" on public.contas_pagar for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "movimentos estoque por usuario" on public.estoque_movimentos;
create policy "movimentos estoque por usuario" on public.estoque_movimentos for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "importacoes por usuario" on public.importacoes_notas;
create policy "importacoes por usuario" on public.importacoes_notas for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
