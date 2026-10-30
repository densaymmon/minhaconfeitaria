import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ChefHat, History, Package, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { movimentosProntosQ, produtosProntosQ, produtosQ, insumosQ, type MovimentoPronto } from "@/lib/queries";
import { lerQuantidade, mapaProntos, mensagemErroEstoque, previaInsumosProducao, quantidadeValida, rotuloMovimentoPronto } from "@/lib/estoque-pronto";
import { formatarQuantidade } from "@/lib/lista-producao";
import { num } from "@/lib/format";
import { RecursoBloqueado, useRecurso } from "@/components/app/plano";
import { Card, Field, NativeSelect } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Acao = { tipo: "produzir" } | { tipo: "descartar"; produtoId: string } | null;

function dataHora(iso: string) {
  try { return format(parseISO(iso), "dd/MM HH:mm"); } catch { return ""; }
}

/**
 * Produtos prontos que ainda não foram vendidos: registrar o que foi produzido (baixa os insumos),
 * descartar perdas e desfazer um registro feito por engano. O uso em pedidos é feito no pedido
 * (manual: escolha por item; catálogo: automático).
 */
export function EstoquePronto() {
  const temPlano = useRecurso("estoque");
  const qc = useQueryClient();
  const { data: produtos } = useSuspenseQuery(produtosQ);
  const { data: insumos } = useSuspenseQuery(insumosQ);
  const { data: prontos = [] } = useQuery(produtosProntosQ);
  const { data: movimentos = [] } = useQuery(movimentosProntosQ);
  const { data: saldosInsumos = [] } = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_estoque");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [acao, setAcao] = useState<Acao>(null);
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");
  // O mesmo identificador é reaproveitado se a pessoa tentar de novo: o servidor ignora repetição.
  const [eventoId, setEventoId] = useState(() => crypto.randomUUID());
  const [salvando, setSalvando] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const saldo = useMemo(() => mapaProntos(prontos), [prontos]);
  const nomes = useMemo(() => new Map(produtos.map((p) => [p.id, p.nome])), [produtos]);
  const itensProntos = useMemo(
    () => [...saldo.entries()]
      .map(([id, q]) => ({ id, nome: nomes.get(id) ?? "Produto removido", quantidade: q }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [saldo, nomes],
  );
  const totalUnidades = itensProntos.reduce((t, i) => t + i.quantidade, 0);

  const qtd = lerQuantidade(quantidade);
  const produto = produtos.find((p) => p.id === produtoId);
  const previa = useMemo(
    () => (acao?.tipo === "produzir" && produto && qtd > 0 ? previaInsumosProducao(produto, qtd, insumos, saldosInsumos.map((s) => ({ insumo_id: s.insumo_id, saldo: Number(s.saldo), unidade_base: s.unidade_base }))) : null),
    [acao, produto, qtd, insumos, saldosInsumos],
  );

  // Produções que ainda podem ser desfeitas: não revertidas e com todas as unidades no estoque.
  const revertidas = useMemo(() => new Set(movimentos.map((m) => m.reverte_evento_id).filter(Boolean) as string[]), [movimentos]);
  const podeDesfazer = (m: MovimentoPronto) => m.tipo === "producao" && !revertidas.has(m.evento_id) && (saldo.get(m.produto_id) ?? 0) >= Number(m.quantidade_delta);

  function abrir(a: Exclude<Acao, null>) {
    setAcao(a);
    setProdutoId(a.tipo === "descartar" ? a.produtoId : "");
    setQuantidade("1");
    setObservacao("");
    setEventoId(crypto.randomUUID());
  }

  async function atualizar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["estoque-pronto"] }),
      qc.invalidateQueries({ queryKey: ["estoque"] }),
      qc.invalidateQueries({ queryKey: ["pedidos"] }),
    ]);
  }

  async function confirmar() {
    if (!acao) return;
    if (!produtoId) return void toast.error("Escolha o produto.");
    if (!quantidadeValida(qtd)) return void toast.error("Informe uma quantidade maior que zero (até 9.999, com no máximo 3 casas decimais).");
    if (acao.tipo === "descartar" && qtd > (saldo.get(produtoId) ?? 0)) {
      return void toast.error(`Só há ${num(saldo.get(produtoId) ?? 0, 3)} unidade(s) pronta(s) deste produto.`);
    }
    setSalvando(true);
    try {
      const obs = observacao.trim();
      const args = { p_evento_id: eventoId, p_produto_id: produtoId, p_quantidade: qtd, ...(obs ? { p_observacao: obs } : {}) };
      const { error } = acao.tipo === "produzir"
        ? await supabase.rpc("registrar_producao_estoque", args)
        : await supabase.rpc("descartar_estoque_pronto", args);
      if (error) throw new Error(error.message);
      await atualizar();
      toast.success(acao.tipo === "produzir"
        ? `${num(qtd, 3)} × ${produto?.nome ?? "produto"} adicionado(s) ao estoque pronto. Insumos descontados.`
        : `${num(qtd, 3)} × ${produto?.nome ?? "produto"} descartado(s) do estoque pronto.`);
      setAcao(null);
    } catch (e) {
      toast.error(`Não foi possível salvar: ${mensagemErroEstoque(e)}`);
    } finally { setSalvando(false); }
  }

  async function desfazer(m: MovimentoPronto) {
    if (!confirm(`Desfazer a produção de ${num(Number(m.quantidade_delta), 3)} × ${m.produto_nome}? Os insumos voltam ao estoque.`)) return;
    try {
      const { error } = await supabase.rpc("desfazer_producao_estoque", { p_evento_id: crypto.randomUUID(), p_producao_evento_id: m.evento_id });
      if (error) throw new Error(error.message);
      await atualizar();
      toast.success("Produção desfeita. Os insumos voltaram ao estoque.");
    } catch (e) {
      toast.error(`Não foi possível desfazer: ${mensagemErroEstoque(e)}`);
    }
  }

  if (!temPlano) return <RecursoBloqueado recurso="estoque" />;

  const opcoesProduto: { id: string; nome: string }[] = acao?.tipo === "descartar"
    ? itensProntos.map((i) => ({ id: i.id, nome: i.nome }))
    : produtos.filter((p) => p.ativo !== false).map((p) => ({ id: p.id, nome: p.nome }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Produtos prontos em estoque</h2>
          <span className="text-xs text-muted-foreground">
            {itensProntos.length === 0 ? "Sobras de produção que ainda não foram vendidas" : `${num(totalUnidades, 3)} unidade(s) em ${itensProntos.length} produto(s)`}
          </span>
        </div>
        <Button size="sm" onClick={() => abrir({ tipo: "produzir" })}><ChefHat className="size-4" /> Registrar produção</Button>
      </div>

      {itensProntos.length === 0 ? (
        <Card className="border-dashed text-center">
          <div className="mx-auto mb-2 grid size-11 place-items-center rounded-full bg-muted"><Package className="size-5 text-muted-foreground" /></div>
          <h3 className="font-semibold">Nenhum produto pronto em estoque</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Produziu mais do que vendeu? Registre aqui: os insumos são descontados e, quando chegar um pedido desse produto, você pode usar o que já está pronto em vez de produzir de novo.
          </p>
        </Card>
      ) : (
        <Card className="divide-y p-0">
          {itensProntos.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
              <div className="min-w-0">
                <div className="font-medium">{i.nome}</div>
                <div className="text-xs text-muted-foreground">Pronto para entregar</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">{num(i.quantidade, 3)}</div>
                  <div className="text-xs text-muted-foreground">unidade(s)</div>
                </div>
                <Button size="icon" variant="outline" className="size-9" onClick={() => abrir({ tipo: "descartar", produtoId: i.id })} aria-label={`Descartar ${i.nome} do estoque pronto`}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div>
        <button type="button" onClick={() => setMostrarHistorico((v) => !v)} aria-expanded={mostrarHistorico}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <History className="size-4" /> {mostrarHistorico ? "Ocultar histórico" : "Ver histórico"}
        </button>
        {mostrarHistorico && (
          movimentos.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Ainda não há movimentações.</p>
          ) : (
            <Card className="mt-2 divide-y p-0">
              {movimentos.map((m) => {
                const delta = Number(m.quantidade_delta);
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{m.produto_nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {rotuloMovimentoPronto(m.tipo)}{m.pedido_numero ? ` · pedido #${m.pedido_numero}` : ""} · {dataHora(m.created_at)}
                        {m.observacao ? ` · ${m.observacao}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn("font-semibold tabular-nums", delta > 0 ? "text-success" : "text-destructive")}>{delta > 0 ? "+" : ""}{num(delta, 3)}</span>
                      {podeDesfazer(m) && (
                        <Button size="sm" variant="ghost" onClick={() => void desfazer(m)} aria-label={`Desfazer produção de ${m.produto_nome}`}>
                          <Undo2 className="size-4" /> Desfazer
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )
        )}
      </div>

      <Dialog open={!!acao} onOpenChange={(aberto) => { if (!aberto && !salvando) setAcao(null); }}>
        <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{acao?.tipo === "descartar" ? "Descartar do estoque pronto" : "Registrar produção para o estoque"}</DialogTitle>
            <DialogDescription>
              {acao?.tipo === "descartar"
                ? "Use para perdas (estragou, doou, consumo próprio). Os insumos não voltam ao estoque."
                : "As unidades entram no estoque pronto e os insumos da ficha técnica são descontados agora."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Produto">
              <NativeSelect value={produtoId} onChange={(e) => setProdutoId(e.target.value)} disabled={acao?.tipo === "descartar"}>
                <option value="">Escolha o produto</option>
                {opcoesProduto.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Quantidade" hint={acao?.tipo === "descartar" && produtoId ? `Disponível: ${num(saldo.get(produtoId) ?? 0, 3)}` : undefined}>
              <Input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="h-11" />
            </Field>
            <Field label="Observação (opcional)">
              <Input value={observacao} maxLength={300} onChange={(e) => setObservacao(e.target.value)} placeholder={acao?.tipo === "descartar" ? "Ex.: estragou" : "Ex.: sobrou da feira"} className="h-11" />
            </Field>

            {previa && (
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <div className="mb-1 font-medium">Insumos que serão descontados</div>
                {previa.linhas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {previa.semReceita.length > 0 ? "Este produto não tem ficha técnica: nenhum insumo será descontado." : "Nenhum insumo a descontar."}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {previa.linhas.map((l) => (
                      <li key={l.insumo_id} className="flex justify-between gap-2">
                        <span>{l.nome}</span>
                        <span className={cn("tabular-nums", l.falta > 0 && "font-semibold text-destructive")}>
                          {formatarQuantidade(l.necessario, l.unidade)}{l.falta > 0 ? ` · faltam ${formatarQuantidade(l.falta, l.unidade)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {previa.linhas.some((l) => l.falta > 0) && (
                  <p className="mt-2 text-xs text-destructive">O saldo de algum insumo não cobre esta produção. Você pode registrar mesmo assim, mas confira as compras.</p>
                )}
                {previa.semMedida.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Confira a medida na receita de: {previa.semMedida.join(", ")}.</p>}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={salvando} onClick={() => setAcao(null)}>Cancelar</Button>
              <Button type="button" disabled={salvando || !produtoId || !quantidadeValida(qtd)} onClick={() => void confirmar()}>
                {salvando ? "Salvando..." : acao?.tipo === "descartar" ? "Descartar" : "Registrar produção"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
