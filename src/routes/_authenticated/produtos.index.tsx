import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, Download, Plus, Trash2, Pencil, Archive, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCustos } from "@/lib/hooks";
import { alertaMargem, margemReal } from "@/lib/calc";
import { brl, hojeISO, pct, dataBR } from "@/lib/format";
import { custoPorMedida, medidaLabel } from "@/lib/ingredient-cost";
import { IngredientForm } from "@/components/app/ingredient-form";
import { baixarCSV } from "@/lib/csv";
import { Card, Empty, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Insumo } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/produtos/")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.produtosQ),context.queryClient.ensureQueryData(appQueries.insumosQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Produtos e insumos — Doce Gestão" },
      { name: "description", content: "Produtos, receitas e preços dos insumos." },
      { property: "og:title", content: "Produtos e insumos — Doce Gestão" },
      { property: "og:description", content: "Produtos, receitas e preços dos insumos." },
    ],
  }),
  component: Produtos,
});

function Produtos() {
  const { produtos, insumos, custo } = useCustos();
  const navigate = useNavigate();
  const [buscaProduto, setBuscaProduto] = useState("");
  const [soAbaixoDaMargem, setSoAbaixoDaMargem] = useState(false);
  const alertas = new Map(produtos.map((p) => [p.id, alertaMargem(custo.get(p.id) ?? 0, Number(p.preco_venda), Number(p.margem_desejada))]));
  const abaixoDaMargem = produtos.filter((p) => p.ativo && alertas.get(p.id)?.abaixoDaMargem).length;
  const termoProduto = buscaProduto.trim().toLocaleLowerCase("pt-BR");
  const produtosFiltrados = produtos.filter((p) =>
    (!(soAbaixoDaMargem && abaixoDaMargem > 0) || (p.ativo && alertas.get(p.id)?.abaixoDaMargem)) && (!termoProduto ||
    p.nome.toLocaleLowerCase("pt-BR").includes(termoProduto) ||
    (p.categoria ?? "").toLocaleLowerCase("pt-BR").includes(termoProduto))
  );
  return (
    <>
      <PageHeader title="Produtos e receitas" back="/mais" />
      <Tabs defaultValue="produtos">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="produtos">Produtos ({produtos.length})</TabsTrigger>
          <TabsTrigger value="insumos">Insumos ({insumos.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos">
          <div className="mb-3 flex gap-2">
            <Button asChild className="h-11 flex-1">
              <Link to="/produtos/$id" params={{ id: "novo" }} search={{ duplicar: false }}><Plus className="size-4" /> Novo produto</Link>
            </Button>
            <Button
              variant="outline"
              className="h-11"
              aria-label="Exportar CSV"
              onClick={() =>
                baixarCSV(
                  `produtos-${hojeISO()}`,
                  ["Produto", "Categoria", "Rendimento", "Custo unitário", "Preço de venda", "Lucro unitário", "Margem real %", "Ativo"],
                  produtos.map((p) => {
                    const c = custo.get(p.id) ?? 0;
                    return [p.nome, p.categoria, Number(p.rendimento), +c.toFixed(2), Number(p.preco_venda), +(Number(p.preco_venda) - c).toFixed(2), +margemReal(c, Number(p.preco_venda)).toFixed(1), p.ativo];
                  }),
                )
              }
            >
              <Download className="size-4" />
              <span>Exportar CSV</span>
            </Button>
          </div>
          {abaixoDaMargem > 0 && (
            <button
              type="button"
              onClick={() => setSoAbaixoDaMargem((v) => !v)}
              aria-pressed={soAbaixoDaMargem}
              className="mb-3 flex w-full items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-left text-sm text-warning-foreground"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                <b>{abaixoDaMargem} produto(s) abaixo da margem desejada.</b>{" "}
                {soAbaixoDaMargem ? "Toque para ver todos os produtos." : "Toque para ver só esses e ajustar o preço."}
              </span>
            </button>
          )}
          {produtos.length > 0 && (
            <div className="mb-3">
              <Input
                value={buscaProduto}
                onChange={(event) => setBuscaProduto(event.target.value)}
                placeholder="Buscar produto por nome ou categoria"
                aria-label="Buscar produto por nome ou categoria"
              />
            </div>
          )}
          {produtos.length === 0 ? (
            <Empty>
              <div className="mx-auto max-w-sm space-y-3">
                <p className="font-medium text-foreground">Seu catálogo começa aqui</p>
                <p>Cadastre os insumos e depois crie seu primeiro produto com receita, rendimento, custo e preço de venda.</p>
                <Button asChild className="h-11">
                  <Link to="/produtos/$id" params={{ id: "novo" }} search={{ duplicar: false }}><Plus className="size-4" /> Cadastrar primeiro produto</Link>
                </Button>
              </div>
            </Empty>
          ) : (
            produtosFiltrados.length === 0 ? (
              <Empty>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Nenhum produto encontrado</p>
                  <p>Tente outro nome ou categoria.</p>
                  <Button type="button" variant="outline" onClick={() => setBuscaProduto("")}>Limpar busca</Button>
                </div>
              </Empty>
            ) : (
            <div className="space-y-2">
              {produtosFiltrados.map((p) => {
                const c = custo.get(p.id) ?? 0;
                const preco = Number(p.preco_venda);
                const lucro = preco - c;
                const alerta = alertas.get(p.id);
                return (
                  <Card key={p.id} className={`p-3.5 ${p.ativo ? "" : "opacity-60"}`}>
                    <div className="flex items-start gap-2">
                      <Link to="/produtos/$id" params={{ id: p.id }} search={{ duplicar: false }} className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{p.nome}</div>
                            <div className="text-xs text-muted-foreground">{p.categoria}{!p.ativo && " · inativo"}{p.ativo && p.no_catalogo && " · no catálogo"}</div>
                            {p.custo_alterado_em && <div className="mt-1 text-xs text-warning-foreground">Custo atualizado em {dataBR(p.custo_alterado_em)}</div>}
                          </div>
                          <div className="text-right font-semibold">{brl(preco)}</div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 text-xs">
                          <div><div className="text-muted-foreground">Custo un.</div>{brl(c)}</div>
                          <div><div className="text-muted-foreground">Lucro un.</div><span className={lucro >= 0 ? "text-success" : "text-destructive"}>{brl(lucro)}</span></div>
                          <div><div className="text-muted-foreground">Margem</div>{pct(margemReal(c, preco))}</div>
                        </div>
                        {p.ativo && alerta?.abaixoDoCusto && (
                          <div className="mt-2 rounded-lg bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">Preço abaixo do custo: cada unidade vendida dá prejuízo. Sugerido: {brl(alerta.sugerido)}</div>
                        )}
                        {p.ativo && alerta && !alerta.abaixoDoCusto && alerta.abaixoDaMargem && (
                          <div className="mt-2 rounded-lg bg-warning/15 px-2 py-1 text-xs text-warning-foreground">Abaixo da margem desejada ({pct(Number(p.margem_desejada))}). Sugerido: {brl(alerta.sugerido)}</div>
                        )}
                      </Link>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        aria-label={`Duplicar ${p.nome}`}
                        title="Duplicar produto"
                        onClick={() => navigate({ to: "/produtos/$id", params: { id: p.id }, search: { duplicar: true } })}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
            )
          )}
        </TabsContent>
        <TabsContent value="insumos">
          <Insumos insumos={insumos} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Insumos({ insumos }: { insumos: Insumo[] }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [buscaInsumo, setBuscaInsumo] = useState("");
  const termoInsumo = buscaInsumo.trim().toLocaleLowerCase("pt-BR");
  const insumosFiltrados = insumos.filter((insumo) =>
    insumo.nome.toLocaleLowerCase("pt-BR").includes(termoInsumo)
  );

  async function alternarAtivo(i: Insumo) {
    const ativo = i.ativo !== false;
    const acao = ativo ? "inativar" : "reativar";
    if (!confirm(`${ativo ? "Inativar" : "Reativar"} ${i.nome}? ${ativo ? "Ele deixará de aparecer em novos cadastros, mas o histórico será preservado." : "Ele voltará a aparecer nos novos cadastros."}`)) return;
    const { error } = await supabase.from("insumos").update({ ativo: !ativo }).eq("id", i.id);
    if (error) return void toast.error(`Não foi possível ${acao} o insumo: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["insumos"] });
    toast.success(ativo ? "Insumo inativado. O histórico foi preservado." : "Insumo reativado.");
  }

  async function excluir(i: Insumo) {
    if (!confirm(`Excluir ${i.nome}? Essa ação removerá também os registros de estoque e os itens de compras vinculados a esse insumo. Só será permitido excluir se ele não estiver sendo usado em nenhuma receita.`)) return;
    const { error } = await supabase.rpc("excluir_insumo_se_sem_receita", { p_insumo_id: i.id });
    if (error) {
      if (error.message.includes("INSUMO_USADO_EM_RECEITA")) {
        toast.error("Este insumo está sendo usado em uma receita. Remova-o de todas as receitas antes de excluí-lo.");
      } else {
        toast.error(`Não foi possível excluir o insumo: ${error.message}`);
      }
      return;
    }
    await qc.invalidateQueries({ queryKey: ["insumos"] });
    await qc.invalidateQueries({ queryKey: ["compras"] });
    await qc.invalidateQueries({ queryKey: ["estoque"] });
    toast.success("Insumo excluído.");
  }

  return (
    <>
      <Card className="mb-4">
        <h2 className="mb-3 font-semibold">Novo insumo</h2>
        <IngredientForm />
      </Card>
      {insumos.length === 0 ? (
        <Empty>Nenhum insumo cadastrado.</Empty>
      ) : (
        <>
          <div className="mb-3">
            <Input
              value={buscaInsumo}
              onChange={(event) => setBuscaInsumo(event.target.value)}
              placeholder="Buscar insumo por nome"
              aria-label="Buscar insumo por nome"
            />
          </div>
          {insumosFiltrados.length === 0 ? (
            <Empty>
              <div className="space-y-2">
                <p className="font-medium text-foreground">Nenhum insumo encontrado</p>
                <p>Tente outro nome de insumo.</p>
                <Button type="button" variant="outline" onClick={() => setBuscaInsumo("")}>Limpar busca</Button>
              </div>
            </Empty>
          ) : (
            <div className="space-y-2">
              {insumosFiltrados.map((i) => {
            const u = custoPorMedida(i);
            return <Card key={i.id} className="p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="break-words font-medium">{i.nome} {i.ativo === false && <span className="ml-1 rounded bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">Inativo</span>}</div>
                  <div className="text-xs text-muted-foreground">{brl(i.preco_embalagem ?? i.preco_unidade)} / {i.quantidade_embalagem ?? 1} {medidaLabel(i.unidade_embalagem ?? i.unidade)}</div>
                  <div className="text-xs text-muted-foreground">Custo unitário: {brl(u.custo)} / {medidaLabel(u.unidade)}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditando(editando === i.id ? null : i.id)} aria-label={`Editar ${i.nome}`}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => alternarAtivo(i)} aria-label={`${i.ativo === false ? "Reativar" : "Inativar"} ${i.nome}`} title={i.ativo === false ? "Reativar insumo" : "Inativar insumo"}>{i.ativo === false ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}</Button>
                <Button size="icon" variant="ghost" onClick={() => excluir(i)} aria-label={`Excluir ${i.nome}`}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
              {editando === i.id && <div className="mt-3 border-t pt-3"><IngredientForm insumo={i} onDone={() => setEditando(null)} /></div>}
            </Card>;
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
