import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RECURSOS, type Plano } from "@/lib/assinatura";
import { empresasQ, planosQ } from "../dados";
import { erroAmigavel, supabase } from "../supabase";
import { Campo, Cartao, Etiqueta, Titulo, brl } from "../ui";

export function PaginaPlanos() {
  const { data: planos = [], isLoading, error } = useQuery(planosQ);
  const { data: empresas = [] } = useQuery(empresasQ);
  const [novo, setNovo] = useState(false);
  return (
    <>
      <Titulo titulo="Planos" subtitulo="Preços, limites e recursos de cada plano. Mudanças valem na hora para quem já assina."
        acao={!novo ? <Button type="button" size="sm" onClick={() => setNovo(true)}><Plus className="size-4" /> Novo plano</Button> : undefined} />
      {isLoading ? <p className="py-10 text-center text-sm text-muted-foreground" role="status">Carregando…</p>
        : error ? <p role="alert" className="py-8 text-destructive">{error.message}</p>
        : (
          <div className="grid gap-4 lg:grid-cols-3">
            {novo && <FormPlano plano={null} assinantes={0} aoSalvar={() => setNovo(false)} />}
            {planos.map((p) => (
              <FormPlano key={p.id} plano={p} assinantes={empresas.filter((e) => e.plano_id === p.id && e.acesso === "ativo").length} />
            ))}
          </div>
        )}
    </>
  );
}

function FormPlano({ plano, assinantes, aoSalvar }: { plano: Plano | null; assinantes: number; aoSalvar?: () => void }) {
  const qc = useQueryClient();
  const inicial = () => ({
    id: plano?.id ?? "",
    nome: plano?.nome ?? "",
    descricao: plano?.descricao ?? "",
    preco_mensal: plano ? String(plano.preco_mensal) : "",
    preco_anual: plano?.preco_anual == null ? "" : String(plano.preco_anual),
    limite_pedidos_mes: plano?.limite_pedidos_mes == null ? "" : String(plano.limite_pedidos_mes),
    limite_produtos: plano?.limite_produtos == null ? "" : String(plano.limite_produtos),
    recursos: plano?.recursos ?? [],
    ordem: String(plano?.ordem ?? 10),
    ativo: plano?.ativo ?? true,
  });
  const [f, setF] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setF(inicial()); }, [plano]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const codigo = plano ? plano.id : f.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

  async function salvar() {
    if (!f.nome.trim()) return void toast.error("Informe o nome do plano.");
    const preco = num(f.preco_mensal);
    if (preco == null || !Number.isFinite(preco) || preco < 0) return void toast.error("Informe o preço mensal.");
    setSalvando(true);
    const { error } = await supabase.rpc("admin_salvar_plano", {
      p: {
        id: codigo, nome: f.nome.trim(), descricao: f.descricao.trim() || null, preco_mensal: preco, preco_anual: num(f.preco_anual),
        limite_pedidos_mes: num(f.limite_pedidos_mes), limite_produtos: num(f.limite_produtos), recursos: f.recursos,
        ordem: Number(f.ordem) || 0, ativo: f.ativo,
      },
    });
    setSalvando(false);
    if (error) return void toast.error(erroAmigavel(error));
    await qc.invalidateQueries({ queryKey: ["admin"] });
    toast.success("Plano salvo.");
    aoSalvar?.();
  }

  const alternar = (id: string) => setF({ ...f, recursos: f.recursos.includes(id) ? f.recursos.filter((r) => r !== id) : [...f.recursos, id] });

  return (
    <Cartao className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">{plano ? plano.nome : "Novo plano"}</h2>
        {plano && <Etiqueta tom={plano.ativo ? "ok" : "neutro"}>{plano.ativo ? `${assinantes} assinante(s)` : "Inativo"}</Etiqueta>}
      </div>
      <Campo rotulo="Nome"><Input maxLength={40} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className="h-10" /></Campo>
      <Campo rotulo="Descrição curta"><Textarea rows={2} maxLength={300} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Preço mensal (R$)"><Input inputMode="decimal" value={f.preco_mensal} onChange={(e) => setF({ ...f, preco_mensal: e.target.value })} className="h-10" /></Campo>
        <Campo rotulo="Preço anual (R$)" dica={num(f.preco_mensal) ? `12× mensal = ${brl((num(f.preco_mensal) ?? 0) * 12)}` : undefined}><Input inputMode="decimal" value={f.preco_anual} onChange={(e) => setF({ ...f, preco_anual: e.target.value })} className="h-10" /></Campo>
        <Campo rotulo="Pedidos por mês" dica="Vazio = ilimitado"><Input inputMode="numeric" value={f.limite_pedidos_mes} onChange={(e) => setF({ ...f, limite_pedidos_mes: e.target.value })} className="h-10" /></Campo>
        <Campo rotulo="Produtos" dica="Vazio = ilimitado"><Input inputMode="numeric" value={f.limite_produtos} onChange={(e) => setF({ ...f, limite_produtos: e.target.value })} className="h-10" /></Campo>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Recursos incluídos</legend>
        <p className="text-xs text-muted-foreground">Pedidos, clientes, produção, recibos, avisos no WhatsApp e Pix estão em todos os planos.</p>
        {RECURSOS.map((r) => (
          <label key={r.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={f.recursos.includes(r.id)} onChange={() => alternar(r.id)} className="mt-0.5 size-4 accent-primary" />
            <span><span className="font-medium">{r.nome}</span><span className="block text-xs text-muted-foreground">{r.descricao}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 items-end gap-3">
        <Campo rotulo="Ordem de exibição"><Input inputMode="numeric" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} className="h-10" /></Campo>
        <label className="flex h-10 items-center justify-between rounded-md border px-3 text-sm">Ativo<Switch checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v })} /></label>
      </div>
      {!plano && codigo && <p className="text-xs text-muted-foreground">Código: {codigo}</p>}
      <div className="flex gap-2">
        {!plano && <Button type="button" variant="outline" onClick={aoSalvar}>Cancelar</Button>}
        <Button type="button" className="flex-1" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar plano"}</Button>
      </div>
    </Cartao>
  );
}
