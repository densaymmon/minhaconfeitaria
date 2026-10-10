
-- Proprietário único: bloqueia novos cadastros após o primeiro usuário
create or replace function public.limitar_proprietario_unico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from auth.users) >= 1 then
    raise exception 'Cadastro desativado: o sistema já possui uma proprietária.';
  end if;
  return new;
end; $$;
create trigger trg_proprietario_unico before insert on auth.users
for each row execute function public.limitar_proprietario_unico();

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  nome text not null,
  telefone text,
  endereco text,
  observacoes text,
  created_at timestamptz not null default now()
);

create table public.insumos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  nome text not null,
  tipo text not null default 'ingrediente',
  unidade text not null default 'kg',
  preco_unidade numeric(12,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_insumos_upd before update on public.insumos for each row execute function public.set_updated_at();

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  nome text not null,
  categoria text not null default 'Outros',
  rendimento numeric(12,3) not null default 1,
  custo_gas numeric(12,2) not null default 0,
  custo_energia numeric(12,2) not null default 0,
  custo_mao_obra numeric(12,2) not null default 0,
  preco_venda numeric(12,2) not null default 0,
  margem_desejada numeric(6,2) not null default 100,
  modo_preparo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.receita_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  produto_id uuid not null references public.produtos(id) on delete cascade,
  insumo_id uuid not null references public.insumos(id) on delete restrict,
  quantidade numeric(12,4) not null default 0
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  user_id uuid not null default auth.uid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  data_entrega date not null,
  hora_entrega text,
  status text not null default 'recebido' check (status in ('recebido','confirmado','em_producao','pronto','entregue','cancelado')),
  forma_pagamento text not null default 'pix',
  valor_entrada numeric(12,2) not null default 0,
  saldo_quitado boolean not null default false,
  desconto numeric(12,2) not null default 0,
  taxa_entrega numeric(12,2) not null default 0,
  observacoes text,
  created_at timestamptz not null default now()
);

create table public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  produto_id uuid references public.produtos(id) on delete set null,
  descricao text not null,
  quantidade numeric(12,3) not null default 1,
  preco_unitario numeric(12,2) not null default 0,
  custo_unitario numeric(12,4) not null default 0,
  quantidade_produzida numeric(12,3) not null default 0
);

create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  data date not null default current_date,
  descricao text not null,
  categoria text not null default 'Outros',
  valor numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.configuracoes (
  user_id uuid primary key default auth.uid(),
  taxa_pix numeric(6,2) not null default 0,
  taxa_dinheiro numeric(6,2) not null default 0,
  taxa_debito numeric(6,2) not null default 1.99,
  taxa_credito numeric(6,2) not null default 4.99,
  taxa_outros numeric(6,2) not null default 0,
  imposto_pct numeric(6,2) not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['clientes','insumos','produtos','receita_itens','pedidos','pedido_itens','despesas','configuracoes'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "dono_select" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
    execute format('create policy "dono_insert" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t);
    execute format('create policy "dono_update" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('create policy "dono_delete" on public.%I for delete to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;

create index on public.pedidos (user_id, data_entrega);
create index on public.pedido_itens (pedido_id);
create index on public.receita_itens (produto_id);
