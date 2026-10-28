import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { apagarArquivosMidia, enviarMidiaProduto } from "@/lib/foto-catalogo";
import { GaleriaMidias, midiaSalva, type MidiaEditavel } from "@/components/app/galeria-midias";
import { EditorOpcoes, opcoesParaEdicao, opcoesParaSalvar, type GrupoEditavel } from "@/components/app/editor-opcoes";
import type { MidiaCatalogo } from "@/lib/catalogo";
import { supabase } from "@/integrations/supabase/client";
import { useCustos } from "@/lib/hooks";
import { alertaMargem, custoReceita, custoItemReceita, margemReal, precoSugerido } from "@/lib/calc";
import { CATEGORIAS, brl, parseNum, pct, dataBR } from "@/lib/format";
import { Card, Field, NativeSelect, PageHeader, Row } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { medidasCompativeis, medidaLabel, numeroIngrediente, custoPorMedida } from "@/lib/ingredient-cost";
import { Switch } from "@/components/ui/switch";
import { RecursoBloqueado, useRecurso } from "@/components/app/plano";

export const Route = createFileRoute("/_authenticated/produtos/$id")({
 validateSearch: (search: Record<string, unknown>) => ({ duplicar: search["duplicar"] === "1" }),
 loader: async ({ context, params }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.produtosQ),context.queryClient.ensureQueryData(appQueries.insumosQ),context.queryClient.ensureQueryData(appQueries.midiasProdutoQ(params.id))]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Produto e receita — Doce Gestão" },
      { name: "description", content: "Receita, custos e precificação do produto." },
      { property: "og:title", content: "Produto e receita — Doce Gestão" },
      { property: "og:description", content: "Receita, custos e precificação do produto." },
    ],
  }),
  component: ProdutoForm,
});

function ProdutoForm() {
  // Recursos do plano: sem "custos" só o preço de venda; sem "catalogo" a seção do catálogo fica trancada.
  const temCustos = useRecurso("custos");
  const temCatalogo = useRecurso("catalogo");
  const { id } = Route.useParams();
  const novo = id === "novo";
  const { duplicar } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { produtos, insumos, mapIns } = useCustos();
  const p = novo ? undefined : produtos.find((x) => x.id === id);

  const [f, setF] = useState(() => ({
    nome: p?.nome ? (duplicar ? `${p.nome} (cópia)` : p.nome) : "",
    categoria: p?.categoria ?? "Bolos caseiros",
    rendimento: String(p?.rendimento ?? "1"),
    custo_gas: String(p?.custo_gas ?? "0"),
    custo_energia: String(p?.custo_energia ?? "0"),
    custo_mao_obra: String(p?.custo_mao_obra ?? "0"),
    preco_venda: String(p?.preco_venda ?? "0"),
    margem_desejada: String(p?.margem_desejada ?? "100"),
    modo_preparo: p?.modo_preparo ?? "",
    ativo: p?.ativo ?? true,
  }));
  const [itens, setItens] = useState(() => p?.receita_itens.map((i) => ({ insumo_id: i.insumo_id, quantidade: String(i.quantidade_utilizada ?? i.quantidade), unidade_receita: i.unidade_receita ?? mapIns.get(i.insumo_id)?.unidade ?? "un" })) ?? []);
  const [salvando, setSalvando] = useState(false);
  const [duplicando, setDuplicando] = useState(duplicar);
  const { user } = Route.useRouteContext();
  const [cat, setCat] = useState(() => ({
    no_catalogo: duplicar ? false : (p?.no_catalogo ?? false),
    descricao: p?.descricao ?? "",
    antecedencia_dias: String(p?.antecedencia_dias ?? 1),
  }));
  // Mídias já salvas; a cópia de um produto começa sem fotos para não compartilhar arquivos.
  const { data: midiasSalvas } = useSuspenseQuery(appQueries.midiasProdutoQ(id));
  const [midias, setMidias] = useState<MidiaEditavel[]>(() => (duplicar ? [] : midiasSalvas.map((m) => midiaSalva(m.tipo, m.url))));
  const [progresso, setProgresso] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<GrupoEditavel[]>(() => opcoesParaEdicao(p?.opcoes));

  if (!novo && !p) return <p className="py-16 text-center text-muted-foreground">Produto não encontrado. <Link to="/produtos" className="text-primary">Voltar</Link></p>;

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const prodNum = {
    rendimento: parseNum(f.rendimento) || 1,
    custo_gas: parseNum(f.custo_gas),
    custo_energia: parseNum(f.custo_energia),
    custo_mao_obra: parseNum(f.custo_mao_obra),
  };
  const itensNum = itens.filter((i) => i.insumo_id).map((i) => ({ insumo_id: i.insumo_id, quantidade: numeroIngrediente(i.quantidade), quantidade_utilizada: numeroIngrediente(i.quantidade), unidade_receita: i.unidade_receita }));
  let erroReceita = "";
  let cr = { ingredientes: 0, operacionais: 0, total: 0 };
  try {
    cr = custoReceita(prodNum, itensNum, mapIns);
    if (itensNum.some((i) => !Number.isFinite(i.quantidade) || i.quantidade <= 0)) erroReceita = "Informe quantidade utilizada maior que zero para cada ingrediente.";
  } catch (e) { erroReceita = e instanceof Error ? e.message : "Confira as medidas da receita."; }
  const unit = cr.total / prodNum.rendimento;
  const sugerido = precoSugerido(unit, parseNum(f.margem_desejada));
  const preco = parseNum(f.preco_venda);

  async function salvar() {
    if (!f.nome.trim()) return void toast.error("Informe o nome do produto.");
    if (erroReceita) return void toast.error(erroReceita);
    const opcoesValidadas = opcoesParaSalvar(opcoes);
    if (!opcoesValidadas.ok) return void toast.error(opcoesValidadas.erro);
    setSalvando(true);
    try {
      const payload = {
        nome: f.nome.trim(),
        categoria: f.categoria,
        ...prodNum,
        preco_venda: preco,
        margem_desejada: parseNum(f.margem_desejada),
        modo_preparo: f.modo_preparo.trim() || null,
        ativo: f.ativo,
      };
      const { data: produtoId, error } = await supabase.rpc("salvar_produto", {
        payload, itens: itensNum,
        ...(p && !duplicando ? { registro_id: p.id } : {}),
      });
      if (error) throw error;
      // Campos do catálogo ficam fora da RPC de receita; uma falha aqui não desfaz o produto salvo.
      try {
        const antecedencia = Math.round(parseNum(cat.antecedencia_dias));
        if (!Number.isFinite(antecedencia) || antecedencia < 0 || antecedencia > 60) throw new Error("A antecedência deve ser de 0 a 60 dias.");
        const { error: erroCatalogo } = await supabase.from("produtos").update({
          no_catalogo: cat.no_catalogo,
          descricao: cat.descricao.trim().slice(0, 600) || null,
          antecedencia_dias: antecedencia,
          opcoes: opcoesValidadas.valor,
        }).eq("id", produtoId);
        if (erroCatalogo) throw new Error(erroCatalogo.message);

        // Envia as fotos e vídeos novos e grava a lista final na ordem escolhida.
        const novas = midias.filter((m) => m.arquivo).length;
        let enviadas = 0;
        const finais: MidiaCatalogo[] = [];
        for (const m of midias) {
          if (m.arquivo) {
            enviadas += 1;
            setProgresso(`Enviando fotos e vídeos (${enviadas}/${novas})…`);
            finais.push(await enviarMidiaProduto(user.id, produtoId, m.arquivo));
          } else if (m.url) {
            finais.push({ tipo: m.tipo, url: m.url });
          }
        }
        const { error: erroMidias } = await supabase.rpc("salvar_midias_produto", { p_produto_id: produtoId, p_midias: finais });
        if (erroMidias) throw new Error(erroMidias.message);
        if (!duplicando) {
          const removidas = midiasSalvas.map((m) => m.url).filter((url) => !finais.some((f) => f.url === url));
          void apagarArquivosMidia(user.id, removidas);
        }
        void qc.invalidateQueries({ queryKey: ["produto-midias", produtoId] });
      } catch (e) {
        toast.warning(`Produto salvo, mas os dados do catálogo não: ${(e as Error).message}`);
      } finally {
        setProgresso(null);
      }
      await qc.invalidateQueries({ queryKey: ["produtos"] });
      toast.success(duplicando ? "Cópia criada com sucesso!" : "Produto salvo!");
      navigate({ to: "/produtos" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!p || !confirm(`Excluir ${p.nome}? Pedidos antigos continuam com o nome do item.`)) return;
    const { error } = await supabase.from("produtos").delete().eq("id", p.id);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["produtos"] });
    navigate({ to: "/produtos" });
  }

  return (
    <>
      <PageHeader title={duplicando ? "Duplicar produto" : novo ? "Novo produto" : p?.nome ?? "Produto"} back="/produtos" />
      <div className="space-y-4">
        {p?.custo_alterado_em && <p className="text-sm text-warning-foreground">Custo dos ingredientes atualizado em {dataBR(p.custo_alterado_em)}.</p>}
        <Card className="space-y-3">
          <Field label="Nome do produto">
            <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} className="h-11" placeholder="Ex.: Bolo de cenoura com chocolate" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Categoria">
              <NativeSelect value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Rendimento (unid.)" hint="Quantas unidades a receita rende">
              <Input inputMode="decimal" value={f.rendimento} onChange={(e) => set("rendimento", e.target.value)} className="h-11" />
            </Field>
          </div>
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium">Produto ativo (aparece nos pedidos)</span>
            <Switch checked={f.ativo} onCheckedChange={(v) => set("ativo", v)} />
          </label>
        </Card>

        {!temCustos ? <>
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Preço de venda</h2>
          <Field label="Preço de venda R$">
            <Input inputMode="decimal" value={f.preco_venda} onChange={(e) => set("preco_venda", e.target.value)} className="h-11" />
          </Field>
        </Card>
        <RecursoBloqueado recurso="custos" compacto />
        </> : <>
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Ingredientes e embalagens</h2>
          {insumos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cadastre os insumos primeiro na aba <Link to="/produtos" className="text-primary">Insumos</Link>.
            </p>
          )}
          {itens.map((it, i) => {
            const ins = mapIns.get(it.insumo_id);
            let valor: number | null = null;
            try { valor = custoItemReceita({ insumo_id: it.insumo_id, quantidade: numeroIngrediente(it.quantidade), unidade_receita: it.unidade_receita }, ins); } catch { /* pending invalid input */ }
            const u = ins ? custoPorMedida(ins) : null;
            return (
              <div key={i} className="space-y-2 border-b pb-3">
                <div className="flex gap-2">
                  <NativeSelect aria-label="Ingrediente da receita" value={it.insumo_id} onChange={(e) => {
                    const id = e.target.value;
                    setItens((s) => s.map((x, j) => j === i ? { ...x, insumo_id: id, unidade_receita: mapIns.get(id)?.unidade_embalagem ?? mapIns.get(id)?.unidade ?? "un" } : x));
                  }}>{insumos.filter((x) => x.ativo !== false || x.id === it.insumo_id).map((x) => <option key={x.id} value={x.id}>{x.nome}{x.ativo === false ? " (inativo — histórico)" : ""}</option>)}</NativeSelect>
                  <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" onClick={() => setItens((s) => s.filter((_, j) => j !== i))} aria-label={`Remover ingrediente ${ins?.nome ?? ""}`}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
                <Field label="Quantidade utilizada na receita">
                  <Input inputMode="decimal" value={it.quantidade} onChange={(e) => setItens((s) => s.map((x,j) => j === i ? { ...x, quantidade: e.target.value } : x))} className="h-11" />
                </Field>
                <Field label="Unidade utilizada">
                  <NativeSelect aria-label="Unidade utilizada" value={it.unidade_receita} onChange={(e) => { const value = e.target.value; setItens((s) => s.map((x,j) => j === i ? { ...x, unidade_receita: value } : x)); }}>
                    {medidasCompativeis(ins?.unidade_embalagem ?? ins?.unidade ?? "un").map((u) => <option key={u} value={u}>{medidaLabel(u)}</option>)}
                  </NativeSelect>
                </Field>
                {u && <p className="text-xs text-muted-foreground">Custo unitário: {brl(u.custo)} / {medidaLabel(u.unidade)}</p>}
                <p className="text-sm font-medium">Custo na receita: {valor === null ? "—" : brl(valor)}</p>
              </div>
            );
          })}
          <Button size="sm" variant="outline" disabled={insumos.every((x) => x.ativo === false)} onClick={() => { const disponivel = insumos.find((x) => x.ativo !== false); if (disponivel) setItens((s) => [...s, { insumo_id: disponivel.id, quantidade: "", unidade_receita: disponivel.unidade_embalagem ?? disponivel.unidade ?? "un" }]); }}>
            <Plus className="size-4" /> Insumo
          </Button>
          {erroReceita && <p role="alert" className="text-sm text-destructive">{erroReceita}</p>}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Custos da receita (lote)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Gás R$"><Input inputMode="decimal" value={f.custo_gas} onChange={(e) => set("custo_gas", e.target.value)} className="h-11" /></Field>
            <Field label="Energia R$"><Input inputMode="decimal" value={f.custo_energia} onChange={(e) => set("custo_energia", e.target.value)} className="h-11" /></Field>
            <Field label="Mão de obra R$"><Input inputMode="decimal" value={f.custo_mao_obra} onChange={(e) => set("custo_mao_obra", e.target.value)} className="h-11" /></Field>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Precificação</h2>
          <Row label="Ingredientes e embalagens" value={brl(cr.ingredientes)} />
          <Row label="Gás, energia e mão de obra" value={brl(cr.operacionais)} />
          <Row label="Custo total da receita" value={brl(cr.total)} strong />
          <Row label={`Custo por unidade (÷ ${prodNum.rendimento})`} value={brl(unit)} strong />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field label="Margem desejada %">
              <Input inputMode="decimal" value={f.margem_desejada} onChange={(e) => set("margem_desejada", e.target.value)} className="h-11" />
            </Field>
            <Field label="Preço de venda R$">
              <Input inputMode="decimal" value={f.preco_venda} onChange={(e) => set("preco_venda", e.target.value)} className="h-11" />
            </Field>
          </div>
          <button type="button" className="w-full rounded-xl bg-accent p-3 text-left text-sm text-accent-foreground" onClick={() => set("preco_venda", sugerido.toFixed(2))}>
            Preço sugerido: <b>{brl(sugerido)}</b> — toque para usar
          </button>
          {(() => {
            const alerta = alertaMargem(unit, preco, parseNum(f.margem_desejada));
            if (alerta.abaixoDoCusto) return <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">O preço de venda está abaixo do custo por unidade: cada venda dá prejuízo.</p>;
            if (alerta.abaixoDaMargem) return <p className="rounded-xl bg-warning/15 p-3 text-sm text-warning-foreground">O preço está {brl(alerta.faltaParaMargem)} abaixo do necessário para a margem desejada.</p>;
            return null;
          })()}
          <Row label="Lucro bruto por unidade" value={brl(preco - unit)} tone={preco - unit >= 0 ? "success" : "danger"} strong />
          <Row label="Margem real sobre o custo" value={pct(margemReal(unit, preco))} />
          <Row label="Lucro da receita inteira" value={brl((preco - unit) * prodNum.rendimento)} />
        </Card>
        </>}

        {!temCatalogo ? <RecursoBloqueado recurso="catalogo" compacto /> : (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Catálogo online</h2>
              <p className="text-xs text-muted-foreground">O que o cliente vê na página de pedidos.</p>
            </div>
            <Switch checked={cat.no_catalogo} onCheckedChange={(v) => setCat((c) => ({ ...c, no_catalogo: v }))} aria-label="Mostrar no catálogo" />
          </div>
          {cat.no_catalogo && !f.ativo && <p className="text-xs text-warning-foreground">Produtos inativos não aparecem no catálogo.</p>}
          {cat.no_catalogo && preco <= 0 && <p className="text-xs text-warning-foreground">Informe o preço de venda para o produto aparecer no catálogo.</p>}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Fotos e vídeos</span>
            <GaleriaMidias midias={midias} onChange={setMidias} desabilitado={salvando} />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Variações (tamanho, sabor, recheio…)</span>
            <EditorOpcoes grupos={opcoes} onChange={setOpcoes} precoBase={preco} />
          </div>
          <Field label="Descrição para o cliente">
            <Textarea rows={2} maxLength={600} value={cat.descricao} onChange={(e) => setCat((c) => ({ ...c, descricao: e.target.value }))} placeholder="Ex.: Massa fofinha de cenoura com cobertura de chocolate. Serve 10 pessoas." />
          </Field>
          <Field label="Antecedência mínima (dias)" hint="0 = pode ser pedido para o mesmo dia.">
            <Input inputMode="numeric" value={cat.antecedencia_dias} onChange={(e) => setCat((c) => ({ ...c, antecedencia_dias: e.target.value }))} className="h-11" />
          </Field>
        </Card>
        )}

        <Card>
          <Field label="Modo de preparo / anotações">
            <Textarea rows={3} value={f.modo_preparo} onChange={(e) => set("modo_preparo", e.target.value)} />
          </Field>
        </Card>

        <div className="flex flex-wrap gap-2">
          {!novo && !duplicando && (
            <Button variant="outline" className="h-12 text-destructive" onClick={excluir} aria-label="Excluir produto">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          )}
          <Button className="h-12 flex-1 text-base" onClick={salvar} disabled={salvando}>
            {salvando ? (progresso ?? "Salvando...") : duplicando ? "Salvar como novo produto" : "Salvar produto"}
          </Button>
        </div>
      </div>
    </>
  );
}
