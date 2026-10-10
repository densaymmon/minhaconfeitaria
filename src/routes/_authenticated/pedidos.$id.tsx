import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clientesQ, configQ, pedidosQ } from "@/lib/queries";
import { useCustos } from "@/lib/hooks";
import { totaisPedido } from "@/lib/calc";
import { FORMAS, STATUS, brl, hojeISO, parseNum } from "@/lib/format";
import { Card, Field, NativeSelect, PageHeader, Row } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/pedidos/$id")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Pedido — Doce Gestão" },
      { name: "description", content: "Cadastro e edição de encomenda." },
      { property: "og:title", content: "Pedido — Doce Gestão" },
      { property: "og:description", content: "Cadastro e edição de encomenda." },
    ],
  }),
  component: PedidoForm,
});

type Item = {
  produto_id: string | null;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
  custo_unitario: number;
  quantidade_produzida: number;
};

function PedidoForm() {
  const { id } = Route.useParams();
  const novo = id === "novo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: pedidos } = useSuspenseQuery(pedidosQ);
  const { data: clientes } = useSuspenseQuery(clientesQ);
  const { data: config } = useSuspenseQuery(configQ);
  const { produtos, custo } = useCustos();
  const existente = novo ? undefined : pedidos.find((p) => p.id === id);

  const [f, setF] = useState(() => ({
    cliente_id: existente?.cliente_id ?? "",
    data_entrega: existente?.data_entrega ?? hojeISO(),
    hora_entrega: existente?.hora_entrega ?? "",
    status: existente?.status ?? "recebido",
    forma_pagamento: existente?.forma_pagamento ?? "pix",
    valor_entrada: String(existente?.valor_entrada ?? "0"),
    saldo_quitado: existente?.saldo_quitado ?? false,
    desconto: String(existente?.desconto ?? "0"),
    taxa_entrega: String(existente?.taxa_entrega ?? "0"),
    observacoes: existente?.observacoes ?? "",
  }));
  const [itens, setItens] = useState<Item[]>(
    () =>
      existente?.pedido_itens.map((i) => ({
        produto_id: i.produto_id,
        descricao: i.descricao,
        quantidade: String(i.quantidade),
        preco_unitario: String(i.preco_unitario),
        custo_unitario: Number(i.custo_unitario),
        quantidade_produzida: Number(i.quantidade_produzida),
      })) ?? [],
  );
  const [salvando, setSalvando] = useState(false);

  if (!novo && !existente) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-muted-foreground">Pedido não encontrado.</p>
        <Link to="/pedidos" className="text-primary">Voltar aos pedidos</Link>
      </div>
    );
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const setItem = (i: number, patch: Partial<Item>) => setItens((s) => s.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  function escolherProduto(i: number, pid: string) {
    const p = produtos.find((x) => x.id === pid);
    if (!p) return setItem(i, { produto_id: null });
    setItem(i, {
      produto_id: p.id,
      descricao: p.nome,
      preco_unitario: String(p.preco_venda),
      custo_unitario: +(custo.get(p.id) ?? 0).toFixed(4),
    });
  }

  const t = totaisPedido(
    {
      status: f.status,
      forma_pagamento: f.forma_pagamento,
      valor_entrada: parseNum(f.valor_entrada),
      saldo_quitado: f.saldo_quitado,
      desconto: parseNum(f.desconto),
      taxa_entrega: parseNum(f.taxa_entrega),
      pedido_itens: itens.map((i) => ({
        quantidade: parseNum(i.quantidade),
        preco_unitario: parseNum(i.preco_unitario),
        custo_unitario: i.custo_unitario,
      })),
    },
    config,
  );

  async function salvar() {
    if (itens.length === 0) return void toast.error("Adicione pelo menos um item.");
    if (itens.some((i) => !i.descricao.trim() || parseNum(i.quantidade) <= 0)) return void toast.error("Confira os itens: descrição e quantidade são obrigatórias.");
    setSalvando(true);
    try {
      const payload = {
        cliente_id: f.cliente_id || null,
        data_entrega: f.data_entrega,
        hora_entrega: f.hora_entrega || null,
        status: f.status,
        forma_pagamento: f.forma_pagamento,
        valor_entrada: parseNum(f.valor_entrada),
        saldo_quitado: f.saldo_quitado,
        desconto: parseNum(f.desconto),
        taxa_entrega: parseNum(f.taxa_entrega),
        observacoes: f.observacoes.trim() || null,
      };
      let pedidoId = existente?.id;
      if (pedidoId) {
        const { error } = await supabase.from("pedidos").update(payload).eq("id", pedidoId);
        if (error) throw error;
        const { error: e2 } = await supabase.from("pedido_itens").delete().eq("pedido_id", pedidoId);
        if (e2) throw e2;
      } else {
        const { data, error } = await supabase.from("pedidos").insert(payload).select("id, numero").single();
        if (error) throw error;
        pedidoId = data.id;
      }
      const { error: e3 } = await supabase.from("pedido_itens").insert(
        itens.map((i) => {
          const qtd = parseNum(i.quantidade);
          return {
            pedido_id: pedidoId ?? "",
            produto_id: i.produto_id,
            descricao: i.descricao.trim(),
            quantidade: qtd,
            preco_unitario: parseNum(i.preco_unitario),
            custo_unitario: i.custo_unitario,
            quantidade_produzida: Math.min(i.quantidade_produzida, qtd),
          };
        }),
      );
      if (e3) throw e3;
      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(novo ? "Pedido criado!" : "Pedido atualizado!");
      navigate({ to: "/pedidos" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!existente || !confirm(`Excluir o pedido #${existente.numero}?`)) return;
    const { error } = await supabase.from("pedidos").delete().eq("id", existente.id);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["pedidos"] });
    toast.success("Pedido excluído.");
    navigate({ to: "/pedidos" });
  }

  const cliente = clientes.find((c) => c.id === f.cliente_id);
  const whatsapp = cliente?.telefone ? `https://wa.me/55${cliente.telefone.replace(/\D/g, "").replace(/^55/, "")}` : null;

  return (
    <>
      <PageHeader title={novo ? "Novo pedido" : `Pedido #${existente?.numero}`} back="/pedidos" />
      <div className="space-y-4">
        <Card className="space-y-3">
          <Field label="Cliente">
            <NativeSelect value={f.cliente_id} onChange={(e) => set("cliente_id", e.target.value)}>
              <option value="">— Sem cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex items-center justify-between text-xs">
            <Link to="/clientes" className="text-primary">+ Cadastrar cliente</Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-success">
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data de entrega">
              <Input type="date" value={f.data_entrega} onChange={(e) => set("data_entrega", e.target.value)} className="h-11" />
            </Field>
            <Field label="Horário">
              <Input type="time" value={f.hora_entrega} onChange={(e) => set("hora_entrega", e.target.value)} className="h-11" />
            </Field>
          </div>
          <Field label="Status">
            <NativeSelect value={f.status} onChange={(e) => set("status", e.target.value)}>
              {STATUS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </NativeSelect>
          </Field>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Itens</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setItens((s) => [...s, { produto_id: null, descricao: "", quantidade: "1", preco_unitario: "0", custo_unitario: 0, quantidade_produzida: 0 }])}
            >
              <Plus className="size-4" /> Item
            </Button>
          </div>
          {itens.length === 0 && <p className="text-sm text-muted-foreground">Toque em “Item” para adicionar produtos.</p>}
          {itens.map((it, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-muted/60 p-3">
              <div className="flex gap-2">
                <NativeSelect value={it.produto_id ?? ""} onChange={(e) => escolherProduto(i, e.target.value)}>
                  <option value="">Produto avulso</option>
                  {produtos.filter((p) => p.ativo || p.id === it.produto_id).map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </NativeSelect>
                <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" onClick={() => setItens((s) => s.filter((_, j) => j !== i))} aria-label="Remover item">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <Input placeholder="Descrição / personalização" value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} className="h-11 bg-card" />
              <div className="grid grid-cols-3 gap-2">
                <Field label="Qtd.">
                  <Input inputMode="decimal" value={it.quantidade} onChange={(e) => setItem(i, { quantidade: e.target.value })} className="h-11 bg-card" />
                </Field>
                <Field label="Preço un.">
                  <Input inputMode="decimal" value={it.preco_unitario} onChange={(e) => setItem(i, { preco_unitario: e.target.value })} className="h-11 bg-card" />
                </Field>
                <Field label="Custo un.">
                  <Input
                    inputMode="decimal"
                    value={String(it.custo_unitario)}
                    onChange={(e) => setItem(i, { custo_unitario: parseNum(e.target.value) })}
                    className="h-11 bg-card"
                  />
                </Field>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Total {brl(parseNum(it.quantidade) * parseNum(it.preco_unitario))}
              </div>
            </div>
          ))}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Pagamento</h2>
          <Field label="Forma de pagamento">
            <NativeSelect value={f.forma_pagamento} onChange={(e) => set("forma_pagamento", e.target.value)}>
              {FORMAS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Entrada R$">
              <Input inputMode="decimal" value={f.valor_entrada} onChange={(e) => set("valor_entrada", e.target.value)} className="h-11" />
            </Field>
            <Field label="Frete R$">
              <Input inputMode="decimal" value={f.taxa_entrega} onChange={(e) => set("taxa_entrega", e.target.value)} className="h-11" />
            </Field>
            <Field label="Desconto R$">
              <Input inputMode="decimal" value={f.desconto} onChange={(e) => set("desconto", e.target.value)} className="h-11" />
            </Field>
          </div>
          <label className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
            <span className="text-sm font-medium">Saldo restante já foi pago</span>
            <Switch checked={f.saldo_quitado} onCheckedChange={(v) => set("saldo_quitado", v)} />
          </label>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-semibold">Resumo e lucro</h2>
          <Row label="Subtotal dos itens" value={brl(t.subtotal)} />
          <Row label="Valor vendido" value={brl(t.venda)} strong />
          <Row label="Custo de produção" value={`− ${brl(t.custo)}`} />
          <Row label="Lucro bruto" value={brl(t.lucroBruto)} tone={t.lucroBruto >= 0 ? "success" : "danger"} />
          <Row label="Taxas e impostos" value={`− ${brl(t.taxas)}`} />
          <Row label="Lucro líquido estimado" value={brl(t.lucroLiquido)} strong tone={t.lucroLiquido >= 0 ? "success" : "danger"} />
          <div className="my-2 border-t" />
          <Row label="Recebido" value={brl(t.recebido)} />
          <Row label="Saldo a receber" value={brl(t.saldo)} strong tone={t.saldo > 0 ? "danger" : undefined} />
        </Card>

        <Card>
          <Field label="Observações e personalizações">
            <Textarea rows={3} value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Ex.: escrever 'Parabéns Ana', sem lactose..." />
          </Field>
        </Card>

        <div className="flex gap-2">
          {!novo && (
            <Button variant="outline" className="h-12 text-destructive" onClick={excluir}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="h-12 flex-1 text-base" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar pedido"}
          </Button>
        </div>
      </div>
    </>
  );
}
