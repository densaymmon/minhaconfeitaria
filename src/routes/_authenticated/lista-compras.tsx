import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, MessageCircle, ShoppingBasket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePedidosCalc } from "@/lib/hooks";
import { brl, hojeISO } from "@/lib/format";
import { formatarQuantidade, ingredientesNecessarios } from "@/lib/lista-producao";
import { listaDeCompras, somarDiasISO, textoListaCompras } from "@/lib/gestao";
import { Card, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lista-compras")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.pedidosQ),
      context.queryClient.ensureQueryData(appQueries.configQ),
      context.queryClient.ensureQueryData(appQueries.pedidoPagamentosQ),
      context.queryClient.ensureQueryData(appQueries.produtosQ),
      context.queryClient.ensureQueryData(appQueries.insumosQ),
    ]);
  },
  head: () => ({ meta: [{ title: "Lista de compras — Doce Gestão" }, { name: "description", content: "O que comprar para os pedidos dos próximos dias." }] }),
  component: ListaComprasPage,
});

const PERIODOS = [{ dias: 2, rotulo: "Até amanhã" }, { dias: 3, rotulo: "3 dias" }, { dias: 7, rotulo: "7 dias" }, { dias: 14, rotulo: "14 dias" }] as const;
const CHAVE_MARCADOS = "docegestao:lista-compras:marcados";

function ListaComprasPage() {
  const pedidos = usePedidosCalc();
  const { data: produtos } = useSuspenseQuery(appQueries.produtosQ);
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: estoque = [] } = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_estoque");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const hoje = hojeISO();
  const [dias, setDias] = useState<number>(7);
  const [incluirSemControle, setIncluirSemControle] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHAVE_MARCADOS) ?? "[]") as string[]); } catch { return new Set(); }
  });
  useEffect(() => { try { localStorage.setItem(CHAVE_MARCADOS, JSON.stringify([...marcados])); } catch { /* sem armazenamento */ } }, [marcados]);

  const fim = somarDiasISO(hoje, dias - 1);
  const doPeriodo = pedidos.filter((p) => p.data_entrega >= hoje && p.data_entrega <= fim && !["cancelado", "entregue", "finalizado"].includes(p.status));
  const resultado = useMemo(() => ingredientesNecessarios(
    doPeriodo.flatMap((p) => p.pedido_itens.map((i) => ({ produto_id: i.produto_id, pendente: Math.max(0, Number(i.quantidade) - Number(i.quantidade_produzida)) }))),
    produtos,
    insumos,
    estoque.map((e) => ({ insumo_id: e.insumo_id, saldo: Number(e.saldo), unidade_base: e.unidade_base })),
  ), [doPeriodo, produtos, insumos, estoque]);
  const itens = listaDeCompras(resultado.linhas, insumos.map((i) => ({ ...i, preco_embalagem: i.preco_embalagem == null ? null : Number(i.preco_embalagem), quantidade_embalagem: i.quantidade_embalagem == null ? null : Number(i.quantidade_embalagem) })), incluirSemControle ? "tudo" : "ignorar");
  const semControle = resultado.linhas.filter((l) => l.estoque === null).length;
  const total = itens.reduce((s, i) => s + (i.custo ?? 0), 0);
  const periodo = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}`;
  const texto = textoListaCompras(itens.filter((i) => !marcados.has(i.insumo_id)), periodo);

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); toast.success("Lista copiada."); } catch { toast.error("Não foi possível copiar."); }
  }
  function alternar(id: string) {
    setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <>
      <PageHeader title="Lista de compras" subtitle={`Para ${doPeriodo.length} pedido(s) de ${periodo}`} back="/mais" />
      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Button key={p.dias} type="button" size="sm" variant={dias === p.dias ? "default" : "outline"} onClick={() => setDias(p.dias)}>{p.rotulo}</Button>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex items-center gap-2"><ShoppingBasket className="size-4 text-primary" /><h2 className="font-semibold">O que comprar</h2></div>
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">{doPeriodo.length === 0 ? "Nenhum pedido em aberto neste período." : "O estoque cobre tudo o que os pedidos precisam. 🎉"}</p>
        ) : (
          <ul className="divide-y">
            {itens.map((i) => {
              const ok = marcados.has(i.insumo_id);
              return (
                <li key={i.insumo_id}>
                  <button type="button" onClick={() => alternar(i.insumo_id)} aria-pressed={ok} className="flex w-full items-center gap-3 py-3 text-left">
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border", ok && "border-success bg-success text-success-foreground")}>{ok && <Check className="size-4" />}</span>
                    <span className={cn("min-w-0 flex-1", ok && "text-muted-foreground line-through")}>
                      <span className="block font-medium">{i.nome}</span>
                      <span className="block text-xs text-muted-foreground">Falta {formatarQuantidade(i.falta, i.unidade)}{i.embalagens !== null ? ` · comprar ${i.embalagens}× ${i.embalagem}` : ""}</span>
                    </span>
                    {i.custo !== null && <span className="shrink-0 text-sm tabular-nums">~{brl(i.custo)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {total > 0 && <div className="flex justify-between border-t pt-2 text-sm font-semibold"><span>Estimativa pelo último preço</span><span className="tabular-nums">{brl(total)}</span></div>}
        {itens.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => void copiar()}><Copy className="size-4" /> Copiar</Button>
            <Button asChild variant="outline"><a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></Button>
          </div>
        )}
      </Card>

      <Card className="mt-4 space-y-2 text-sm">
        {semControle > 0 && (
          <label className="flex items-center justify-between gap-3">
            <span>Incluir {semControle} ingrediente(s) sem controle de estoque (compra tudo o que a receita usa)</span>
            <Switch checked={incluirSemControle} onCheckedChange={setIncluirSemControle} />
          </label>
        )}
        {resultado.semReceita.length > 0 && <p className="text-muted-foreground">Sem ficha técnica (fora da conta): {resultado.semReceita.join(", ")}. <Link to="/produtos" className="text-primary hover:underline">Cadastrar receitas</Link></p>}
        {resultado.avulsos > 0 && <p className="text-muted-foreground">{resultado.avulsos} item(ns) avulso(s) sem produto cadastrado não entram na conta.</p>}
        <p className="text-xs text-muted-foreground">Usa o que ainda falta produzir dos pedidos em aberto e desconta o saldo do estoque. Marque o que já comprou; a marcação fica neste aparelho.</p>
      </Card>
    </>
  );
}
