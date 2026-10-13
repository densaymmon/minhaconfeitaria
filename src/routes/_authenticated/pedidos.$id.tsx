import { OrderMessage } from "@/components/app/order-message";
import type { OrderDraft } from "@/lib/order-draft";
import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clientesQ, configQ, pedidosQ } from "@/lib/queries";
import { useCustos } from "@/lib/hooks";
import { totaisPedido } from "@/lib/calc";
import { FORMAS, brl, hojeISO, parseNum, statusLabel } from "@/lib/format";
import { Card, Field, NativeSelect, PageHeader, Row } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/pedidos/$id")({
 loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(appQueries.pedidosQ),context.queryClient.ensureQueryData(appQueries.configQ),context.queryClient.ensureQueryData(appQueries.clientesQ),context.queryClient.ensureQueryData(appQueries.produtosQ),context.queryClient.ensureQueryData(appQueries.insumosQ)]); },
 errorComponent: ({error}) => <p role="alert" className="py-8 text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os registros."}</p>,
 notFoundComponent: () => <p>Registro não encontrado.</p>,

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
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome: "", telefone: "", endereco: "", observacoes: "" });

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

  function aplicarRascunho(draft: OrderDraft) {
    if (itens.length && !confirm("Substituir os itens atuais pelo rascunho da mensagem?")) return;
    setItens(draft.itens.map(item => {
      const product = produtos.find(p => p.id === item.produto_id);
      return {
        produto_id: product?.id ?? null,
        descricao: [item.produto, item.personalizacao].filter(Boolean).join(" — "),
        quantidade: item.quantidade === null ? "" : String(item.quantidade),
        preco_unitario: String(product?.preco_venda ?? 0),
        custo_unitario: product ? +(custo.get(product.id) ?? 0).toFixed(4) : 0,
        quantidade_produzida: 0,
      };
    }));
    setF(current => ({ ...current, data_entrega: draft.data_desejada ?? "", hora_entrega: draft.horario ?? "", observacoes: [draft.observacoes, draft.duvidas.length ? "A confirmar: " + draft.duvidas.join(" ") : null].filter(Boolean).join("\n") }));
    toast.success("Rascunho preenchido. Revise os dados antes de salvar.");
  }

  async function salvarCliente() {
    if (!novoCliente.nome.trim()) return void toast.error("Informe o nome do cliente.");
    setSalvandoCliente(true);
    try {
      const payload = {
        nome: novoCliente.nome.trim().slice(0, 120),
        telefone: novoCliente.telefone.trim().slice(0, 30) || null,
        endereco: novoCliente.endereco.trim().slice(0, 300) || null,
        observacoes: novoCliente.observacoes.trim().slice(0, 1000) || null,
      };
      const { data, error } = await supabase.from("clientes").insert(payload).select("id").single();
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["clientes"] });
      set("cliente_id", data.id);
      setNovoCliente({ nome: "", telefone: "", endereco: "", observacoes: "" });
      setClienteDialogOpen(false);
      toast.success("Cliente cadastrado e vinculado ao pedido!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvandoCliente(false);
    }
  }

  async function salvar() {
    if (!f.data_entrega) return void toast.error("Informe a data de entrega antes de salvar.");
    if (itens.length === 0) return void toast.error("Adicione pelo menos um item.");
    if (itens.some((i) => !i.descricao.trim() || parseNum(i.quantidade) <= 0)) return void toast.error("Confira os itens: descrição e quantidade são obrigatórias.");
    setSalvando(true);
    try {
      const payload = {
        cliente_id: f.cliente_id || null,
        data_entrega: f.data_entrega,
        hora_entrega: f.hora_entrega || null,
        status: f.status === "finalizado" ? "entregue" : f.status,
        forma_pagamento: f.forma_pagamento,
        valor_entrada: parseNum(f.valor_entrada),
        saldo_quitado: f.saldo_quitado,
        desconto: parseNum(f.desconto),
        taxa_entrega: parseNum(f.taxa_entrega),
        observacoes: f.observacoes.trim() || null,
      };
      const { error } = await supabase.rpc("salvar_pedido", {
        payload,
        itens: itens.map((i) => ({
          produto_id: i.produto_id, descricao: i.descricao.trim(),
          quantidade: parseNum(i.quantidade), preco_unitario: parseNum(i.preco_unitario),
          custo_unitario: i.custo_unitario,
          quantidade_produzida: Math.min(i.quantidade_produzida, parseNum(i.quantidade)),
        })),
        ...(existente ? { registro_id: existente.id } : {}),
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(novo ? "Pedido criado!" : "Pedido atualizado!");
      navigate({ to: "/pedidos" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alterarStatusPedido(status: "recebido" | "em_producao" | "pronto" | "entregue") {
    if (!existente || status === f.status) return;
    try {
      const { error } = await supabase.from("pedidos").update({ status }).eq("id", existente.id);
      if (error) throw new Error(error.message);
      set("status", status);
      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(`Status do pedido #${existente.numero} alterado para ${statusLabel(status)}.`);
    } catch (e) {
      toast.error(`Não foi possível atualizar o status do pedido: ${e instanceof Error ? e.message : "tente novamente."}`);
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
      {novo && <OrderMessage onApply={aplicarRascunho} />}
      <Dialog open={clienteDialogOpen} onOpenChange={setClienteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void salvarCliente();
            }}
            className="space-y-3"
          >
            <Field label="Nome *">
              <Input value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} className="h-11" autoFocus />
            </Field>
            <Field label="Telefone / WhatsApp">
              <Input type="tel" inputMode="tel" value={novoCliente.telefone} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} className="h-11" placeholder="(11) 99999-9999" />
            </Field>
            <Field label="Endereço">
              <Input value={novoCliente.endereco} onChange={(e) => setNovoCliente({ ...novoCliente, endereco: e.target.value })} className="h-11" />
            </Field>
            <Field label="Observações">
              <Textarea value={novoCliente.observacoes} onChange={(e) => setNovoCliente({ ...novoCliente, observacoes: e.target.value })} placeholder="Preferências, detalhes importantes..." />
            </Field>
            <Button className="h-11 w-full" disabled={salvandoCliente}>
              {salvandoCliente ? "Salvando cliente..." : "Cadastrar e selecionar cliente"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
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
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => {
                setNovoCliente({ nome: "", telefone: "", endereco: "", observacoes: "" });
                setClienteDialogOpen(true);
              }}
            >
              + Cadastrar cliente
            </button>
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
          <Field label="Status do pedido">
            {existente && f.status !== "cancelado" ? (
              <NativeSelect
                value={f.status === "finalizado" ? "entregue" : f.status === "confirmado" ? "recebido" : f.status}
                onChange={(e) => alterarStatusPedido(e.target.value as "recebido" | "em_producao" | "pronto" | "entregue")}
              >
                <option value="recebido">Recebido</option>
                <option value="em_producao">Em produção</option>
                <option value="pronto">Pronto</option>
                <option value="entregue">Entregue</option>
              </NativeSelect>
            ) : (
              <div className="rounded-lg bg-muted/60 p-3 font-semibold">{statusLabel(f.status)}</div>
            )}
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
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Total {brl(parseNum(it.quantidade) * parseNum(it.preco_unitario))}
              </div>
            </div>
          ))}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Pagamento</h2>
            {t.venda > 0 && t.saldo <= 0 && <span className="rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">Pago</span>}
          </div>
          <Field label="Forma de pagamento">
            <NativeSelect value={f.forma_pagamento} onChange={(e) => set("forma_pagamento", e.target.value)}>
              {FORMAS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Valor pago R$">
              <Input inputMode="decimal" value={f.valor_entrada} onChange={(e) => set("valor_entrada", e.target.value)} className="h-11" />
            </Field>
            <Field label="Frete R$">
              <Input inputMode="decimal" value={f.taxa_entrega} onChange={(e) => set("taxa_entrega", e.target.value)} className="h-11" />
            </Field>
            <Field label="Desconto R$">
              <Input inputMode="decimal" value={f.desconto} onChange={(e) => set("desconto", e.target.value)} className="h-11" />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-semibold">Resumo do pedido</h2>
          <Row label="Subtotal dos produtos" value={brl(t.subtotal)} />
          <Row label="Frete" value={brl(parseNum(f.taxa_entrega))} />
          <Row label="Descontos" value={`− ${brl(parseNum(f.desconto))}`} />
          <div className="my-2 border-t" />
          <Row label="Total" value={brl(t.venda)} strong />
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
