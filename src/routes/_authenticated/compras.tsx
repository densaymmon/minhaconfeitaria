import * as appQueries from "@/lib/queries";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataBR, hojeISO } from "@/lib/format";
import { medida, medidaLabel, medidasCompativeis, numeroIngrediente } from "@/lib/ingredient-cost";
import { Card, Empty, Field, PageHeader } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/compras")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.insumosQ),
      context.queryClient.ensureQueryData(appQueries.comprasQ),
      context.queryClient.ensureQueryData(appQueries.compraItensQ),
    ]);
  },
  errorComponent: ({ error }) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar as compras."}</p>,
  head: () => ({
    meta: [
      { title: "Compras de insumos — Doce Gestão" },
      { name: "description", content: "Registro de compras de insumos e gastos por período." },
      { property: "og:title", content: "Compras de insumos — Doce Gestão" },
      { property: "og:description", content: "Registro de compras de insumos e gastos por período." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Compras,
});

const MEDIDAS_COMPRA = ["g", "kg", "L", "ml", "un"] as const;
type Linha = { compraItemId?: string; insumo_id: string; quantidade: string; unidade: string; preco: string };
const linhaVazia = (): Linha => ({ insumo_id: "", quantidade: "", unidade: "un", preco: "" });

// Nunca permita que valores numéricos inválidos vindos do banco apareçam como "NaN"
// em campos controlados; valores ausentes permanecem vazios e editáveis.
function textoCampoNumerico(valor: unknown): string {
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  if (typeof valor !== "string") return "";
  const texto = valor.trim();
  if (!texto || ["nan", "infinity", "-infinity", "undefined", "null"].includes(texto.toLowerCase())) return "";
  return texto;
}

// Aceita ponto ou vírgula como separador decimal sem alterar o texto durante a digitação.
function numeroCompra(valor: string): number {
  const texto = valor.trim().replace(/\s/g, "");
  // Campo vazio ou separador no final é um estado normal durante a digitação.
  if (!texto || /^[+-]?(?:\d+[.,]|[.,])$/.test(texto)) return NaN;
  if (!/^[+-]?[\d.,]+$/.test(texto)) return NaN;

  const semSinal = texto.replace(/^[+-]/, "");
  const virgula = semSinal.lastIndexOf(",");
  const ponto = semSinal.lastIndexOf(".");
  let normalizado = texto;

  if (virgula >= 0 && ponto >= 0) {
    // Quando há os dois sinais, o último é decimal e o outro é separador de milhar.
    const separadorDecimal = virgula > ponto ? "," : ".";
    const separadorMilhar = separadorDecimal === "," ? /\./g : /,/g;
    const parteDecimal = semSinal.slice(Math.max(virgula, ponto) + 1);
    if (!parteDecimal || !/^\d+$/.test(parteDecimal)) return NaN;
    normalizado = texto.replace(separadorMilhar, "").replace(separadorDecimal, ".");
  } else if (virgula >= 0 || ponto >= 0) {
    // Em formato brasileiro, "1.800" representa mil e oitocentos.
    // Vírgula continua sendo separador decimal; ponto com exatamente 3 dígitos
    // finais é tratado como separador de milhar para quantidades como 1.800 ml.
    if (ponto >= 0 && /^\d{1,3}(?:\.\d{3})+$/.test(semSinal)) {
      normalizado = texto.replace(/\./g, "");
    } else {
      normalizado = texto.replace(",", ".");
      if ((normalizado.match(/\./g) ?? []).length > 1) return NaN;
    }
  }

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalizado)) return NaN;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

function valorTotalEditavel(item: { total: unknown; preco_unitario: unknown; quantidade: unknown }): string {
  const total = typeof item.total === "number" ? item.total : Number(item.total);
  if (Number.isFinite(total) && total >= 0) return String(total);
  const unitario = typeof item.preco_unitario === "number" ? item.preco_unitario : Number(item.preco_unitario);
  const quantidade = typeof item.quantidade === "number" ? item.quantidade : Number(item.quantidade);
  const calculado = unitario * quantidade;
  return Number.isFinite(calculado) && calculado >= 0 ? String(calculado) : "";
}

// O estado guarda apenas dígitos (centavos); a máscara é aplicada só na exibição.
// Separar o texto cru do texto formatado evita que a vírgula mova o cursor ou apague a digitação.
function formatarValorMonetario(digitos: string): string {
  const somenteDigitos = digitos.replace(/\D/g, "");
  if (!somenteDigitos) return "";
  const centavos = Number(somenteDigitos);
  if (!Number.isSafeInteger(centavos)) return "";
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function valorMonetarioEmCentavos(valor: string): number {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return NaN;
  const centavos = Number(digitos);
  return Number.isSafeInteger(centavos) ? centavos / 100 : NaN;
}

// Converte valores já salvos em reais para o estado cru em centavos, ao editar uma compra.
function valorExistenteEmCentavos(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return "";
  return String(Math.round((numero + Number.EPSILON) * 100));
}

function Compras() {
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: compras } = useSuspenseQuery(appQueries.comprasQ);
  const { data: itens } = useSuspenseQuery(appQueries.compraItensQ);
  const { data: estoque = [], isLoading: carregandoEstoque, error: erroEstoque } = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_estoque");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const qc = useQueryClient();
  const [data, setData] = useState(hojeISO());
  const [localCompra, setLocalCompra] = useState("");
  const [formaPagamentoCompra, setFormaPagamentoCompra] = useState("pix");
  const [numeroParcelasCompra, setNumeroParcelasCompra] = useState("1");
  const [primeiroVencimentoCompra, setPrimeiroVencimentoCompra] = useState(hojeISO());
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()]);
  const [busy, setBusy] = useState(false);
  const eventoSalvarRef = useRef<{ assinatura: string; id: string } | null>(null);
  const [inventarioFisico, setInventarioFisico] = useState<Record<string, string>>({});
  const eventoInventarioRef = useRef<{ assinatura: string; id: string } | null>(null);
  const eventoCancelarRef = useRef<{ compraId: string; id: string } | null>(null);
  const eventoExcluirRef = useRef<{ compraId: string; id: string } | null>(null);
  const [editandoCompraId, setEditandoCompraId] = useState<string | null>(null);
  const formularioCompraRef = useRef<HTMLFormElement | null>(null);

  // Ao iniciar uma edição, leve o formulário para o início da área de registro.
  useEffect(() => {
    if (editandoCompraId) {
      formularioCompraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editandoCompraId]);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  // Only the four measures the owner asked for, and only those that match the insumo's package.
  const unidadesPara = (insumoId: string) => {
    const ins = insumos.find((i) => i.id === insumoId);
    const opcoes = medidasCompativeis(ins?.unidade_embalagem ?? ins?.unidade ?? "un").filter((u) => (MEDIDAS_COMPRA as readonly string[]).includes(u));
    return opcoes.length ? opcoes : [...MEDIDAS_COMPRA];
  };

  const calculadas = linhas.map((l) => {
    const insumo = insumos.find((i) => i.id === l.insumo_id);
    const quantidadeNumerica = numeroCompra(l.quantidade);
    const precoNumerico = valorMonetarioEmCentavos(l.preco);
    // Preserve l.preco as the raw string so intermediate input like "12," or "12."
    // is not replaced with NaN while the user is typing.
    return { ...l, insumo, quantidadeNumerica, precoNumerico, total: precoNumerico };
  });
  const total = calculadas.reduce((s, l) => s + (Number.isFinite(l.total) ? l.total : 0), 0);

  const noPeriodo = (iso: string) => (!de || iso >= de) && (!ate || iso <= ate);
  const comprasPeriodo = compras.filter((c) => noPeriodo(c.data_compra));
  const comprasNoPeriodo = comprasPeriodo.filter((c) => !c.cancelada_em);
  const idsNoPeriodo = new Set(comprasNoPeriodo.map((c) => c.id));
  const itensNoPeriodo = itens.filter((i) => idsNoPeriodo.has(i.compra_id));
  const totalPeriodo = itensNoPeriodo.reduce((s, i) => s + Number(i.total), 0);

  const porInsumo = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; total: number; quantidade: number; unidade: string }>();
    for (const it of itensNoPeriodo) {
      const nome = insumos.find((i) => i.id === it.insumo_id)?.nome ?? "Insumo removido";
      const conversao = medida(it.unidade);
      const unidadeBase = conversao?.base ?? it.unidade;
      const quantidadeBase = Number(it.quantidade) * (conversao?.fator ?? 1);
      const atual = m.get(it.insumo_id) ?? {
        id: it.insumo_id,
        nome,
        total: 0,
        quantidade: 0,
        unidade: unidadeBase,
      };
      m.set(it.insumo_id, {
        ...atual,
        total: atual.total + Number(it.total),
        quantidade: atual.quantidade + quantidadeBase,
      });
    }
    return [...m.values()]
      .map((item) => {
        const divisor = item.unidade === "g" || item.unidade === "ml" ? 1000 : 1;
        const unidade =
          item.unidade === "g" ? "kg" : item.unidade === "ml" ? "L" : item.unidade;
        return { ...item, quantidade: item.quantidade / divisor, unidade };
      })
      .sort((a, b) => b.total - a.total);
  }, [itensNoPeriodo, insumos]);

  function escolherInsumo(index: number, id: string) {
    const ins = insumos.find((i) => i.id === id);
    const unidade = unidadesPara(id)[0] ?? "un";
    setLinhas((s) => s.map((l, j) => (j === index ? { ...l, insumo_id: id, unidade, preco: "" } : l)));
  }

  async function cancelarCompra(compra: { id: string; cancelada_em: string | null }) {
    if (compra.cancelada_em) return;
    if (!confirm("Cancelar esta compra? O registro será mantido no histórico e, se ela movimentou o estoque, será lançado um estorno.")) return;
    if (!eventoCancelarRef.current || eventoCancelarRef.current.compraId !== compra.id) {
      eventoCancelarRef.current = { compraId: compra.id, id: crypto.randomUUID() };
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("cancelar_compra", {
        registro_id: compra.id,
        evento_id: eventoCancelarRef.current.id,
      });
      if (error) throw error;
      eventoCancelarRef.current = null;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["compras"] }),
        qc.invalidateQueries({ queryKey: ["compra-itens"] }),
        qc.invalidateQueries({ queryKey: ["estoque"] }),
      ]);
      if (editandoCompraId === compra.id) {
        setEditandoCompraId(null);
        setLinhas([linhaVazia()]);
      }
      toast.success("Compra cancelada. O histórico foi preservado.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível cancelar a compra.");
    } finally {
      setBusy(false);
    }
  }

  async function excluirCompra(compra: { id: string; cancelada_em: string | null }) {
    if (!confirm("Excluir permanentemente esta compra? Ela sairá do histórico. Se movimentou o estoque, o saldo será estornado. Contas a pagar não canceladas impedem a exclusão; contas canceladas serão preservadas no histórico financeiro e desvinculadas pela operação segura do banco.")) return;
    if (!eventoExcluirRef.current || eventoExcluirRef.current.compraId !== compra.id) {
      eventoExcluirRef.current = { compraId: compra.id, id: crypto.randomUUID() };
    }
    setBusy(true);
    try {
      // A RPC valida as contas vinculadas e desvincula apenas as canceladas
      // dentro da mesma transação, sem escrita direta na tabela protegida.
      const { error } = await supabase.rpc("excluir_compra", {
        registro_id: compra.id,
        evento_id: eventoExcluirRef.current.id,
      });
      if (error) throw error;
      eventoExcluirRef.current = null;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["compras"] }),
        qc.invalidateQueries({ queryKey: ["compra-itens"] }),
        qc.invalidateQueries({ queryKey: ["estoque"] }),
        qc.invalidateQueries({ queryKey: ["contas-pagar"] }),
      ]);
      if (editandoCompraId === compra.id) {
        setEditandoCompraId(null);
        setData(hojeISO());
        setLocalCompra("");
        setLinhas([linhaVazia()]);
      }
      toast.success("Compra excluída do histórico.");
    } catch (erro) {
      const mensagem = erro instanceof Error
        ? erro.message
        : typeof erro === "object" && erro !== null && "message" in erro && typeof erro.message === "string"
          ? erro.message
          : "Não foi possível excluir a compra.";
      toast.error(mensagem);
    } finally {
      setBusy(false);
    }
  }

  async function salvarInventario(e: React.FormEvent) {
    e.preventDefault();
    const preenchidos = estoque.filter((item) =>
      Boolean(inventarioFisico[item.insumo_id]?.trim()) && item.unidade_base,
    );
    if (!preenchidos.length) {
      toast.error("Informe a quantidade física de pelo menos um insumo.");
      return;
    }
    const itensInventario = preenchidos.map((item) => ({
      insumo_id: item.insumo_id,
      quantidade_fisica: numeroIngrediente(inventarioFisico[item.insumo_id] ?? ""),
      unidade_base: item.unidade_base!,
    }));
    if (itensInventario.some((item) => !Number.isFinite(item.quantidade_fisica) || item.quantidade_fisica < 0)) {
      toast.error("Confira as quantidades físicas. Use valores iguais ou maiores que zero.");
      return;
    }
    const assinatura = JSON.stringify(itensInventario);
    if (!eventoInventarioRef.current || eventoInventarioRef.current.assinatura !== assinatura) {
      eventoInventarioRef.current = { assinatura, id: crypto.randomUUID() };
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("registrar_inventario_fisico", {
        itens: itensInventario,
        evento_id: eventoInventarioRef.current.id,
      });
      if (error) throw error;
      eventoInventarioRef.current = null;
      setInventarioFisico({});
      await qc.invalidateQueries({ queryKey: ["estoque"] });
      toast.success("Contagem física registrada e saldo ajustado.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível registrar o inventário.");
    } finally {
      setBusy(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!data) { toast.error("Informe a data da compra."); return; }
    if (calculadas.some((l) => !l.insumo || !Number.isFinite(l.quantidadeNumerica) || l.quantidadeNumerica <= 0 || !Number.isFinite(l.precoNumerico) || l.precoNumerico < 0)) {
      toast.error("Selecione um insumo e confira a quantidade e o preço de cada item.");
      return;
    }
    if (total <= 0) { toast.error("O total da compra precisa ser maior que zero."); return; }
    setBusy(true);
    try {
      // Se já houve pagamento de alguma parcela, bloqueie a edição antes de alterar
      // os itens da compra, para não deixar o histórico financeiro inconsistente.
      if (editandoCompraId) {
        const { data: contasGeradas, error: erroContas } = await supabase
          .from("contas_pagar")
          .select("id")
          .eq("compra_id", editandoCompraId)
          .eq("gerada_automaticamente", true);
        if (erroContas) throw erroContas;
        const idsContas = (contasGeradas ?? []).map((conta) => conta.id);
        if (idsContas.length) {
          const { data: pagamentosExistentes, error: erroPagamentos } = await supabase
            .from("contas_pagar_pagamentos")
            .select("id")
            .in("conta_id", idsContas);
          if (erroPagamentos) throw erroPagamentos;
          if ((pagamentosExistentes ?? []).length) {
            throw new Error("Esta compra já possui parcela com pagamento registrado. Para proteger o extrato financeiro, não é possível editar a compra; registre os ajustes necessários separadamente.");
          }
        }
      }
      const payload = { data_compra: data };
      const itensPayload = calculadas.map((l) => {
        // O banco legado aceita L, mas não ml. Normalize líquidos para litros
        // no payload para que "1800 ml" seja persistido como "1,8 L" e o estoque
        // receba a quantidade correta sem exigir alteração manual do banco.
        const quantidadeBanco = l.unidade === "ml" ? l.quantidadeNumerica / 1000 : l.quantidadeNumerica;
        const unidadeBanco = l.unidade === "ml" ? "L" : l.unidade;
        return {
          insumo_id: l.insumo!.id,
          quantidade: quantidadeBanco,
          unidade: unidadeBanco,
          // O formulário recebe o valor total pago pelo pacote; o banco armazena o preço por medida.
          preco_unitario: l.precoNumerico / quantidadeBanco,
        };
      });
      const assinatura = JSON.stringify({ ...(editandoCompraId ? { registro_id: editandoCompraId } : {}), payload, itens: itensPayload });
      if (!eventoSalvarRef.current || eventoSalvarRef.current.assinatura !== assinatura) {
        eventoSalvarRef.current = { assinatura, id: crypto.randomUUID() };
      }
      const { data: compraSalvaId, error } = await supabase.rpc("salvar_compra", {
        payload,
        itens: itensPayload,
        ...(editandoCompraId ? { registro_id: editandoCompraId } : {}),
        evento_id: eventoSalvarRef.current.id,
      });
      if (error) throw error;
      if (!compraSalvaId) throw new Error("A compra foi processada sem retornar seu identificador.");
      const { error: erroLocal } = await supabase.rpc("registrar_local_compra", {
        registro_id: compraSalvaId,
        local_compra: localCompra.trim() || null,
      });
      if (erroLocal) throw erroLocal;
      const { error: erroFinanceiro } = await supabase.rpc("registrar_pagamento_compra", {
        p_compra_id: compraSalvaId,
        p_forma_pagamento: formaPagamentoCompra,
        p_numero_parcelas: formaPagamentoCompra === "credito" ? Number(numeroParcelasCompra) : 1,
        p_primeiro_vencimento: formaPagamentoCompra === "credito" ? primeiroVencimentoCompra : data,
      });
      if (erroFinanceiro) throw erroFinanceiro;
      eventoSalvarRef.current = null;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["compras"] }),
        qc.invalidateQueries({ queryKey: ["compra-itens"] }),
        qc.invalidateQueries({ queryKey: ["estoque"] }),
        qc.invalidateQueries({ queryKey: ["contas-pagar"] }),
        qc.invalidateQueries({ queryKey: ["contas-pagar-pagamentos"] }),
      ]);
      setData(hojeISO());
      setLocalCompra("");
      setFormaPagamentoCompra("pix");
      setNumeroParcelasCompra("1");
      setPrimeiroVencimentoCompra(hojeISO());
      setLinhas([linhaVazia()]);
      setEditandoCompraId(null);
      toast.success(editandoCompraId ? "Compra atualizada." : "Compra registrada.");
    } catch (erro) {
      // Supabase returns structured error objects rather than native Error instances.
      // Surface the real backend message so save failures can be diagnosed accurately.
      const mensagem = erro instanceof Error
        ? erro.message
        : typeof erro === "object" && erro !== null && "message" in erro && typeof erro.message === "string"
          ? erro.message
          : "Não foi possível salvar a compra.";
      toast.error(mensagem);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Compras de insumos" back="/mais" />

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Estoque atual</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          O saldo considera somente movimentações registradas após a ativação do controle de estoque. Compras antigas não são incluídas automaticamente.
        </p>
        {carregandoEstoque ? (
          <p className="py-3 text-sm text-muted-foreground">Carregando saldo...</p>
        ) : erroEstoque ? (
          <p role="alert" className="rounded-lg border p-3 text-sm text-destructive">Não foi possível carregar o estoque: {erroEstoque instanceof Error ? erroEstoque.message : "tente novamente."}</p>
        ) : estoque.length === 0 ? (
          <Empty>Nenhum insumo cadastrado.</Empty>
        ) : (
          <div className="divide-y rounded-xl border px-3">
            {estoque.map((item) => {
              const saldo = Number(item.saldo);
              const unidade = item.unidade_base ?? "unidade não convertida";
              return (
                <div key={item.insumo_id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.nome}</p>
                    <p className="text-xs text-muted-foreground">{unidade}</p>
                  </div>
                  <b className={saldo < 0 ? "text-destructive" : ""}>
                    {saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                    {saldo < 0 ? " · estoque negativo" : ""}
                  </b>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="mb-8 rounded-xl border p-4">
        <h2 className="mb-2 text-lg font-semibold">Conferência física do estoque</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Conte o que existe agora e informe a quantidade na unidade indicada. O sistema ajustará apenas a diferença. Compras antigas não serão importadas automaticamente; insumos sem unidade compatível precisam ser corrigidos no cadastro antes da contagem.
        </p>
        <form onSubmit={salvarInventario} className="space-y-3">
          {estoque.map((item) => {
            const saldo = Number(item.saldo);
            const unidade = item.unidade_base;
            return (
              <div key={item.insumo_id} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 border-b pb-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="font-medium">{item.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Saldo calculado: {saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unidade ?? ""}
                  </p>
                </div>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">Físico ({unidade ?? "indefinido"})</span>
                  <Input
                    inputMode="decimal"
                    aria-label={`Quantidade física de ${item.nome}`}
                    placeholder={unidade ? "Ex.: 250" : "Corrigir unidade"}
                    disabled={!unidade || busy}
                    value={inventarioFisico[item.insumo_id] ?? ""}
                    onChange={(e) => setInventarioFisico((s) => ({ ...s, [item.insumo_id]: e.target.value }))}
                  />
                </label>
              </div>
            );
          })}
          <Button type="submit" variant="outline" className="h-11 w-full" disabled={busy || !estoque.some((item) => item.unidade_base && Boolean(inventarioFisico[item.insumo_id]?.trim()))}>
            {busy ? "Registrando..." : "Registrar contagem física"}
          </Button>
        </form>
      </section>

      <form ref={formularioCompraRef} onSubmit={salvar} className="mb-8 scroll-mt-4 space-y-4">
        <h2 className="text-lg font-semibold">{editandoCompraId ? "Editar compra" : "Registrar compra"}</h2>
        <Field label="Data da compra">
          <Input required type="date" className="h-11" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Local da compra (opcional)">
          <Input
            type="text"
            autoComplete="organization"
            maxLength={120}
            placeholder="Ex.: Atacadão, Assaí, loja ou fornecedor"
            className="h-11"
            value={localCompra}
            onChange={(e) => setLocalCompra(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Método de pagamento">
            <select required value={formaPagamentoCompra} onChange={(e) => setFormaPagamentoCompra(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="credito">Cartão de crédito</option>
              <option value="debito">Cartão de débito</option>
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </Field>
          {formaPagamentoCompra === "credito" && <>
            <Field label="Parcelamento">
              <select required value={numeroParcelasCompra} onChange={(e) => setNumeroParcelasCompra(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{n}x</option>)}
              </select>
            </Field>
            <Field label="Vencimento da 1ª parcela" hint="As próximas parcelas vencem mensalmente a partir desta data.">
              <Input required type="date" className="h-11" value={primeiroVencimentoCompra} onChange={(e) => setPrimeiroVencimentoCompra(e.target.value)} />
            </Field>
          </>}
        </div>
        {formaPagamentoCompra === "credito" && total > 0 && (
          <p className="rounded-lg bg-muted p-3 text-sm">
            Previsão: {numeroParcelasCompra} parcela(s) de aproximadamente {brl(Math.floor(Math.round(total * 100) / Number(numeroParcelasCompra)) / 100)}.
            {Number(numeroParcelasCompra) > 1 ? " A última parcela pode ter diferença de centavos para fechar exatamente o total." : ""}
          </p>
        )}
        <div className="space-y-3">
          {calculadas.map((l, index) => (
            <div key={index} className="space-y-3 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Item {index + 1}</h3>
                {linhas.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setLinhas((s) => s.filter((_, j) => j !== index))} aria-label="Remover item">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
              <Field label="Insumo">
                <select required value={l.insumo_id} onChange={(e) => escolherInsumo(index, e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Selecione um insumo</option>
                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantidade">
                  <Input required type="text" inputMode="decimal" lang="pt-BR" autoComplete="off" className="h-11" value={l.quantidade} onChange={(e) => { const valorDigitado = e.currentTarget.value; setLinhas((s) => s.map((x, j) => (j === index ? { ...x, quantidade: valorDigitado } : x))); }} />
                </Field>
                <Field label="Medida">
                  <select value={l.unidade} onChange={(e) => setLinhas((s) => s.map((x, j) => (j === index ? { ...x, unidade: e.target.value } : x)))} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {unidadesPara(l.insumo_id).map((u) => <option key={u} value={u}>{medidaLabel(u)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Valor (R$)">
                <Input required type="text" inputMode="numeric" lang="pt-BR" autoComplete="off" className="h-11" value={formatarValorMonetario(l.preco)} onChange={(e) => { const digitos = e.currentTarget.value.replace(/\D/g, ""); setLinhas((s) => s.map((x, j) => (j === index ? { ...x, preco: digitos } : x))); }} />
              </Field>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valor total pago</span>
                <b>{Number.isFinite(l.total) ? brl(l.total) : "—"}</b>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={() => setLinhas((s) => [...s, linhaVazia()])}>
            <Plus className="size-4" /> Adicionar insumo
          </Button>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-muted p-3">
          <span className="font-medium">Total da compra</span>
          <span className="text-lg font-bold">{brl(total)}</span>
        </div>
        <Button disabled={busy || !insumos.length} className="h-11 w-full">{busy ? "Salvando compra..." : editandoCompraId ? "Salvar alterações" : "Salvar compra"}</Button>
        {editandoCompraId && <Button type="button" variant="outline" className="h-11 w-full" onClick={() => { setEditandoCompraId(null); setData(hojeISO()); setLocalCompra(""); setFormaPagamentoCompra("pix"); setNumeroParcelasCompra("1"); setPrimeiroVencimentoCompra(hojeISO()); setLinhas([linhaVazia()]); }}>Cancelar edição</Button>}
        {!insumos.length && <p className="text-sm text-muted-foreground">Cadastre primeiro os insumos em Produtos e receitas.</p>}
      </form>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShoppingCart className="size-5" /> Gastos por período</h2>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Field label="De"><Input type="date" className="h-10" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} /></Field>
          <Field label="Até"><Input type="date" className="h-10" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} /></Field>
        </div>
        {(de || ate) && (
          <button type="button" className="mb-3 text-sm text-primary" onClick={() => { setDe(""); setAte(""); }}>Limpar período</button>
        )}
        <Card className="mb-3 p-3">
          <div className="text-sm text-muted-foreground">Total comprado no período</div>
          <div className="mt-1 font-display text-2xl font-semibold">{brl(totalPeriodo)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{comprasNoPeriodo.length} compra(s)</div>
        </Card>
        {porInsumo.length === 0 ? (
          <Empty>Nenhuma compra no período.</Empty>
        ) : (
          <div className="divide-y">
            {porInsumo.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.nome}</p>
                  <p className="text-xs text-muted-foreground">{r.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {medidaLabel(r.unidade)}</p>
                </div>
                <b>{brl(r.total)}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Histórico de compras</h2>
        {comprasPeriodo.length === 0 ? (
          <Empty>Nenhuma compra registrada.</Empty>
        ) : (
          <div className="divide-y">
            {comprasPeriodo.map((c) => {
              const doDia = itens.filter((i) => i.compra_id === c.id);
              return (
                <div key={c.id} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{dataBR(c.data_compra)}</p>
                      {c.local_compra && <p className="text-xs text-muted-foreground">{c.local_compra}</p>}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <b className={c.cancelada_em ? "text-muted-foreground line-through" : ""}>{Number.isFinite(Number(c.total)) ? brl(Number(c.total)) : "Valor indisponível"}</b>
                      {c.cancelada_em ? (
                        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Cancelada</span>
                      ) : (
                        <>
                          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => {
                            const itensCompra = itens.filter((i) => i.compra_id === c.id);
                            setData(c.data_compra);
                            setLocalCompra(c.local_compra ?? "");
                            setFormaPagamentoCompra(c.forma_pagamento_compra ?? "pix");
                            setNumeroParcelasCompra(String(c.numero_parcelas ?? 1));
                            setPrimeiroVencimentoCompra(c.primeiro_vencimento ?? c.data_compra);
                            setLinhas(itensCompra.map((i) => ({ compraItemId: i.id, insumo_id: i.insumo_id, quantidade: textoCampoNumerico(i.quantidade), unidade: i.unidade, preco: valorExistenteEmCentavos(valorTotalEditavel(i)) })));
                            setEditandoCompraId(c.id);
                          }}>Editar</Button>
                          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void cancelarCompra(c)}>Cancelar</Button>
                        </>
                      )}
                      <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void excluirCompra(c)}>
                        <Trash2 className="mr-1 size-3.5" /> Excluir
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {doDia.map((i) => `${i.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${medidaLabel(i.unidade)} de ${insumos.find((x) => x.id === i.insumo_id)?.nome ?? "insumo removido"}`).join(" · ") || "Sem itens"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
