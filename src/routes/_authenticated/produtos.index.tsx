import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, Download, Eye, EyeOff, Plus, Trash2, Pencil, Archive, RotateCcw } from "lucide-react";
import { contarPorCategoria, daCategoria } from "@/lib/categorias-produto";
import { supabase } from "@/integrations/supabase/client";
import { useCustos } from "@/lib/hooks";
import { alertaMargem, margemReal } from "@/lib/calc";
import { brl, hojeISO, pct, dataBR } from "@/lib/format";
import { custoPorMedida, medidaLabel } from "@/lib/ingredient-cost";
import { IngredientForm } from "@/components/app/ingredient-form";
import { PreparoForm } from "@/components/app/preparo-form";
import { CATEGORIA_PREPAROS, custoPorPorcao, ehPreparo } from "@/lib/preparos";
import { baixarCSV } from "@/lib/csv";
import { Card, Empty, PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Insumo } from "@/lib/queries";
import type { PreparoItem } from "@/lib/database-compat";
import { confirmar } from "@/lib/confirmar";

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

/** Valor do filtro "Recheios e coberturas" (não colide com o nome de uma categoria de produto). */
const FILTRO_PREPAROS = "__preparos__";

function Produtos() {
  const { produtos, insumos: todosInsumos, custo } = useCustos();
  // Preparos (recheios/coberturas) ficam aqui na aba Produtos; a aba Insumos mostra só os comprados.
  const { data: preparoItens } = useQuery(appQueries.preparoItensQ);
  const insumos = todosInsumos.filter((i) => !ehPreparo(i));
  const preparos = preparoItens ? todosInsumos.filter(ehPreparo) : [];
  const [novoPreparo, setNovoPreparo] = useState(false);
  const navigate = useNavigate();
  const [buscaProduto, setBuscaProduto] = useState("");
  const [soAbaixoDaMargem, setSoAbaixoDaMargem] = useState(false);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const qc = useQueryClient();
  // "oculto" só existe depois da migração 0052; antes disso o botão não aparece.
  const suportaOculto = produtos.some((p) => "oculto" in p);
  const totalOcultos = produtos.filter((p) => p.oculto).length;
  const visiveis = mostrarOcultos ? produtos : produtos.filter((p) => !p.oculto);
  const contagemCategorias = contarPorCategoria(visiveis);
  const categoriaAtiva = categoria === FILTRO_PREPAROS
    ? (preparos.length ? FILTRO_PREPAROS : null)
    : categoria && contagemCategorias.some((c) => daCategoria({ categoria: c.categoria }, categoria)) ? categoria : null;
  const soPreparos = categoriaAtiva === FILTRO_PREPAROS;
  async function alternarOculto(id: string, nome: string, oculto: boolean) {
    const { error } = await supabase.from("produtos").update({ oculto: !oculto }).eq("id", id);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["produtos"] });
    toast.success(oculto ? `${nome} voltou para a lista.` : `${nome} foi ocultado. Toque em "Mostrar ocultos" para ver.`);
  }
  const alertas = new Map(produtos.map((p) => [p.id, alertaMargem(custo.get(p.id) ?? 0, Number(p.preco_venda), Number(p.margem_desejada))]));
  const abaixoDaMargem = produtos.filter((p) => p.ativo && alertas.get(p.id)?.abaixoDaMargem).length;
  const termoProduto = buscaProduto.trim().toLocaleLowerCase("pt-BR");
  const preparosFiltrados = preparos.filter((i) => !termoProduto || i.nome.toLocaleLowerCase("pt-BR").includes(termoProduto) || CATEGORIA_PREPAROS.toLocaleLowerCase("pt-BR").includes(termoProduto));
  const mostrarPreparos = Boolean(preparoItens) && !(soAbaixoDaMargem && abaixoDaMargem > 0) && (categoriaAtiva === null || soPreparos);
  const produtosFiltrados = soPreparos ? [] : visiveis.filter((p) => daCategoria(p, categoriaAtiva) &&
    (!(soAbaixoDaMargem && abaixoDaMargem > 0) || (p.ativo && alertas.get(p.id)?.abaixoDaMargem)) && (!termoProduto ||
    p.nome.toLocaleLowerCase("pt-BR").includes(termoProduto) ||
    (p.categoria ?? "").toLocaleLowerCase("pt-BR").includes(termoProduto))
  );
  return (
    <>
      <PageHeader title="Produtos e receitas" back="/mais" />
      <Tabs defaultValue="produtos">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="produtos">Produtos ({produtos.length - (mostrarOcultos ? 0 : totalOcultos)})</TabsTrigger>
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
          {preparoItens && (
            novoPreparo ? (
              <Card className="mb-3">
                <h2 className="mb-1 font-semibold">Novo recheio ou cobertura</h2>
                <p className="mb-3 text-xs text-muted-foreground">Cadastre a receita uma vez (ingredientes e quanto rende). Depois, na receita de cada bolo, informe só a quantidade usada.</p>
                <PreparoForm insumos={todosInsumos} onDone={() => setNovoPreparo(false)} />
              </Card>
            ) : (
              <Button type="button" variant="outline" className="mb-3 h-11 w-full" onClick={() => setNovoPreparo(true)}>
                <Plus className="size-4" /> Novo recheio ou cobertura
              </Button>
            )
          )}
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
          {contagemCategorias.length + (preparos.length ? 1 : 0) > 1 && (
            <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por categoria">
              {[
                { categoria: null as string | null, total: visiveis.length + preparos.length, rotulo: "Todas" },
                ...contagemCategorias.map((c) => ({ ...c, rotulo: c.categoria })),
                ...(preparos.length ? [{ categoria: FILTRO_PREPAROS as string | null, total: preparos.length, rotulo: CATEGORIA_PREPAROS }] : []),
              ].map((c) => {
                const ativa = c.categoria === null
                  ? categoriaAtiva === null
                  : c.categoria === FILTRO_PREPAROS
                    ? soPreparos
                    : categoriaAtiva !== null && !soPreparos && daCategoria({ categoria: c.categoria }, categoriaAtiva);
                return (
                  <button
                    key={c.categoria ?? "__todas__"}
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => setCategoria(c.categoria)}
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${ativa ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted"}`}
                  >
                    {c.rotulo} <span className={ativa ? "opacity-80" : "text-muted-foreground"}>{c.total}</span>
                  </button>
                );
              })}
            </div>
          )}
          {suportaOculto && totalOcultos > 0 && (
            <button
              type="button"
              onClick={() => setMostrarOcultos((v) => !v)}
              aria-pressed={mostrarOcultos}
              className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {mostrarOcultos ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {mostrarOcultos ? "Esconder ocultos" : `Mostrar ocultos (${totalOcultos})`}
            </button>
          )}
          {!soPreparos && (produtos.length === 0 ? (
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
            produtosFiltrados.length === 0 ? (mostrarPreparos && preparosFiltrados.length > 0 ? null :
              <Empty>
                <div className="space-y-2">
                  <p className="font-medium text-foreground">Nenhum produto encontrado</p>
                  <p>Tente outro nome ou categoria.</p>
                  <Button type="button" variant="outline" onClick={() => { setBuscaProduto(""); setCategoria(null); }}>Limpar filtros</Button>
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
                  <Card key={p.id} className={`p-3.5 ${p.ativo && !p.oculto ? "" : "opacity-60"}`}>
                    <div className="flex items-start gap-2">
                      <Link to="/produtos/$id" params={{ id: p.id }} search={{ duplicar: false }} className="min-w-0 flex-1">
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{p.nome}</div>
                            <div className="text-xs text-muted-foreground">{p.categoria}{p.oculto && " · oculto"}{!p.ativo && " · inativo"}{p.ativo && p.no_catalogo && " · no catálogo"}</div>
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
                      <div className="flex shrink-0 flex-col gap-2">
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
                      {suportaOculto && (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          aria-label={`${p.oculto ? "Mostrar" : "Ocultar"} ${p.nome}`}
                          title={p.oculto ? "Mostrar na lista" : "Ocultar da lista"}
                          onClick={() => alternarOculto(p.id, p.nome, Boolean(p.oculto))}
                        >
                          {p.oculto ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                        </Button>
                      )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            )
          ))}
          {mostrarPreparos && (preparosFiltrados.length > 0 || soPreparos) && (
            <Preparos preparos={preparosFiltrados} preparoItens={preparoItens ?? []} todosInsumos={todosInsumos} produtos={produtos} />
          )}
        </TabsContent>
        <TabsContent value="insumos">
          <Insumos insumos={insumos} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Recheios e coberturas (preparos): receitas de base usadas nas receitas dos produtos. */
function Preparos({ preparos, preparoItens, todosInsumos, produtos }: {
  preparos: Insumo[];
  preparoItens: PreparoItem[];
  todosInsumos: Insumo[];
  produtos: { id: string; receita_itens: { insumo_id: string }[] }[];
}) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [duplicando, setDuplicando] = useState<string | null>(null);
  const usoEm = (id: string) => produtos.filter((p) => p.receita_itens.some((r) => r.insumo_id === id)).length;

  async function excluir(i: Insumo) {
    if (!(await confirmar({ titulo: `Excluir ${i.nome}?`, mensagem: "Só é possível se ele não estiver na receita de nenhum produto.", acao: "Excluir", destrutivo: true }))) return;
    const { error } = await supabase.rpc("excluir_insumo_se_sem_receita", { p_insumo_id: i.id });
    if (error) {
      toast.error(error.message.includes("INSUMO_USADO_EM_RECEITA")
        ? `${i.nome} está na receita de algum produto. Tire-o das receitas antes de excluir.`
        : `Não foi possível excluir: ${error.message}`);
      return;
    }
    await Promise.all([qc.invalidateQueries({ queryKey: ["insumos"] }), qc.invalidateQueries({ queryKey: ["preparo-itens"] })]);
    toast.success(`${i.nome} excluído.`);
  }

  return (
    <div className="mt-5 space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{CATEGORIA_PREPAROS}</h2>
      {preparos.length === 0 && <Empty>Nenhum recheio ou cobertura cadastrado. Toque em "Novo recheio ou cobertura".</Empty>}
      {preparos.map((i) => {
        const lote = Number(i.preco_embalagem ?? 0);
        const porcao = custoPorPorcao(lote, Number(i.quantidade_embalagem ?? 1), i.unidade_embalagem ?? i.unidade);
        const usos = usoEm(i.id);
        const qtdIngredientes = preparoItens.filter((x) => x.preparo_id === i.id).length;
        return (
          <Card key={i.id} className="p-3.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="break-words font-semibold">{i.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {CATEGORIA_PREPAROS} · rende {Number(i.quantidade_embalagem ?? 1).toLocaleString("pt-BR")} {medidaLabel(i.unidade_embalagem ?? i.unidade)} · {qtdIngredientes} ingrediente(s)
                </div>
                <div className="mt-2 grid grid-cols-3 text-xs">
                  <div><div className="text-muted-foreground">Custo total</div>{brl(lote)}</div>
                  <div><div className="text-muted-foreground">{porcao ? `A cada ${porcao.porcao}` : "Porção"}</div>{porcao ? brl(porcao.custo) : "—"}</div>
                  <div><div className="text-muted-foreground">Usado em</div>{usos} produto(s)</div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => { setDuplicando(null); setEditando(editando === i.id ? null : i.id); }} aria-label={`Editar ${i.nome}`}><Pencil className="size-4" /></Button>
                <Button type="button" variant="outline" size="icon" onClick={() => { setEditando(null); setDuplicando(duplicando === i.id ? null : i.id); }} aria-label={`Duplicar ${i.nome}`} title="Duplicar"><Copy className="size-4" /></Button>
                <Button type="button" variant="outline" size="icon" onClick={() => excluir(i)} aria-label={`Excluir ${i.nome}`}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
            {editando === i.id && (
              <div className="mt-3 border-t pt-3">
                <PreparoForm preparo={i} itens={preparoItens.filter((x) => x.preparo_id === i.id)} insumos={todosInsumos} onDone={() => setEditando(null)} />
              </div>
            )}
            {duplicando === i.id && (
              <div className="mt-3 border-t pt-3">
                <p className="mb-2 text-sm font-medium">Duplicar {i.nome}</p>
                <PreparoForm duplicar preparo={i} itens={preparoItens.filter((x) => x.preparo_id === i.id)} insumos={todosInsumos} onDone={() => setDuplicando(null)} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
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
    if (!(await confirmar({ titulo: `${ativo ? "Inativar" : "Reativar"} ${i.nome}?`, mensagem: ativo ? "Ele deixará de aparecer em novos cadastros, mas o histórico será preservado." : "Ele voltará a aparecer nos novos cadastros.", acao: ativo ? "Inativar" : "Reativar" }))) return;
    const { error } = await supabase.from("insumos").update({ ativo: !ativo }).eq("id", i.id);
    if (error) return void toast.error(`Não foi possível ${acao} o insumo: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["insumos"] });
    toast.success(ativo ? "Insumo inativado. O histórico foi preservado." : "Insumo reativado.");
  }

  async function excluir(i: Insumo) {
    if (!(await confirmar({ titulo: `Excluir ${i.nome}?`, mensagem: "Essa ação removerá também os registros de estoque e os itens de compras vinculados a esse insumo. Só será permitido excluir se ele não estiver sendo usado em nenhuma receita.", acao: "Excluir", destrutivo: true }))) return;
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
