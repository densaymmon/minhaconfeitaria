-- Recupera parcelas de compras antigas no crédito que foram salvas antes da geração automática.
-- Idempotente: não cria parcelas para compras que já possuam qualquer conta vinculada.
begin;

do $$
declare
  compra record;
  parcelas integer;
  total_centavos bigint;
  valor_base_centavos bigint;
  valor_parcela_centavos bigint;
  parcela integer;
  vencimento_base date;
  descricao_compra text;
begin
  for compra in
    select
      c.id,
      c.user_id,
      c.data_compra,
      c.primeiro_vencimento,
      c.numero_parcelas,
      c.local_compra,
      c.total,
      coalesce(itens.total_itens, 0) as total_itens
    from public.compras c
    left join lateral (
      select sum(ci.total) as total_itens
      from public.compra_itens ci
      where ci.compra_id = c.id
        and ci.user_id = c.user_id
    ) itens on true
    where lower(trim(coalesce(c.forma_pagamento_compra, ''))) = 'credito'
      and c.cancelada_em is null
      and not exists (
        select 1
        from public.contas_pagar cp
        where cp.user_id = c.user_id
          and cp.compra_id = c.id
      )
    order by c.data_compra, c.id
  loop
    total_centavos := round(
      coalesce(nullif(compra.total, 0), compra.total_itens, 0) * 100
    )::bigint;

    if total_centavos <= 0 then
      raise notice 'Compra % ignorada: total não positivo.', compra.id;
      continue;
    end if;

    parcelas := greatest(1, least(coalesce(compra.numero_parcelas, 1), 24));
    vencimento_base := coalesce(compra.primeiro_vencimento, compra.data_compra);
    valor_base_centavos := total_centavos / parcelas;
    descricao_compra := 'Compra de insumos' ||
      case
        when nullif(trim(compra.local_compra), '') is not null
          then ' - ' || trim(compra.local_compra)
        else ''
      end;

    for parcela in 1..parcelas loop
      valor_parcela_centavos := case
        when parcela = parcelas
          then total_centavos - (valor_base_centavos * (parcelas - 1))
        else valor_base_centavos
      end;

      insert into public.contas_pagar (
        user_id,
        compra_id,
        descricao,
        fornecedor,
        data_emissao,
        data_vencimento,
        valor,
        valor_pago,
        forma_pagamento,
        status,
        observacoes,
        compra_parcela_numero,
        compra_parcelas_total,
        gerada_automaticamente
      ) values (
        compra.user_id,
        compra.id,
        descricao_compra || ' - parcela ' || parcela || '/' || parcelas,
        compra.local_compra,
        compra.data_compra,
        (vencimento_base + ((parcela - 1) * interval '1 month'))::date,
        valor_parcela_centavos::numeric / 100,
        0,
        'Cartão de crédito',
        'pendente',
        '[COMPRA_PARCELA] Recuperada automaticamente para compra antiga no crédito.',
        parcela,
        parcelas,
        true
      );
    end loop;

    update public.compras
    set numero_parcelas = parcelas,
        primeiro_vencimento = vencimento_base
    where id = compra.id
      and user_id = compra.user_id;
  end loop;
end;
$$;

commit;
