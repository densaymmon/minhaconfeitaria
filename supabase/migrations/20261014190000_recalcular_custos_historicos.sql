-- Recalcula custos gravados nos itens de pedidos a partir dos preços e receitas atuais.
-- A função só atua nos dados do usuário autenticado e apenas em itens vinculados
-- a produtos com receita ou custos operacionais cadastrados.
create or replace function public.recalcular_custos_historicos()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_atualizados integer := 0;
begin
  if auth.uid() is null then
    raise exception 'É necessário estar autenticado para recalcular os custos.';
  end if;

  with custos_produto as (
    select
      p.id as produto_id,
      p.user_id,
      (
        coalesce(sum(
          case
            when public.medida_base(coalesce(i.unidade_embalagem, i.unidade, 'un'))
               = public.medida_base(coalesce(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
            then
              (coalesce(i.preco_embalagem, i.preco_unidade, 0)
                / nullif(coalesce(i.quantidade_embalagem, 1) * public.medida_fator(coalesce(i.unidade_embalagem, i.unidade, 'un')), 0))
              * coalesce(ri.quantidade_utilizada, ri.quantidade, 0)
              * public.medida_fator(coalesce(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
            else null
          end
        ), 0)
        + coalesce(p.custo_gas, 0)
        + coalesce(p.custo_energia, 0)
        + coalesce(p.custo_mao_obra, 0)
      ) / case when coalesce(p.rendimento, 0) > 0 then p.rendimento else 1 end as custo_unitario,
      count(ri.id) as quantidade_ingredientes,
      count(*) filter (
        where ri.id is not null
          and public.medida_base(coalesce(i.unidade_embalagem, i.unidade, 'un'))
              IS DISTINCT FROM public.medida_base(coalesce(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
      ) as unidades_incompativeis
    from public.produtos p
    left join public.receita_itens ri on ri.produto_id = p.id and ri.user_id = p.user_id
    left join public.insumos i on i.id = ri.insumo_id and i.user_id = p.user_id
    where p.user_id = auth.uid()
      and (
        exists (select 1 from public.receita_itens rx where rx.produto_id = p.id and rx.user_id = p.user_id)
        or coalesce(p.custo_gas, 0) > 0
        or coalesce(p.custo_energia, 0) > 0
        or coalesce(p.custo_mao_obra, 0) > 0
      )
    group by p.id, p.user_id, p.custo_gas, p.custo_energia, p.custo_mao_obra, p.rendimento
    having count(*) filter (
      where ri.id is not null
        and public.medida_base(coalesce(i.unidade_embalagem, i.unidade, 'un'))
            IS DISTINCT FROM public.medida_base(coalesce(ri.unidade_receita, i.unidade, i.unidade_embalagem, 'un'))
    ) = 0
  )
  update public.pedido_itens pi
  set custo_unitario = round(cp.custo_unitario, 4)
  from custos_produto cp
  where pi.produto_id = cp.produto_id
    and pi.user_id = auth.uid()
    and pi.custo_unitario is distinct from round(cp.custo_unitario, 4);

  get diagnostics v_atualizados = row_count;
  return v_atualizados;
end;
$$;

revoke all on function public.recalcular_custos_historicos() from public;
grant execute on function public.recalcular_custos_historicos() to authenticated;
