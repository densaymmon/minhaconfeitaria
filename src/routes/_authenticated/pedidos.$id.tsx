import { OrderMessage } from "@/components/app/order-message";
import type { OrderDraft } from "@/lib/order-draft";
import * as appQueries from "@/lib/queries";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CalendarClock, Copy, MessageCircle, Plus, Repeat, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clientesQ, configQ, pedidosQ, type PedidoPagamento } from "@/lib/queries";
import { useCustos } from "@/lib/hooks";
import { alertaMargem, totaisPedido } from "@/lib/calc";
import { FORMAS, brl, dataBR, hojeISO, parseNum, statusLabel } from "@/lib/format";
import { Card, Field, NativeSelect, PagamentoBadge, PageHeader, Row } from "@/components/app/ui";
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
  id?: string;
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
  const temProducaoRegistrada = Boolean(existente?.pedido_itens.some((item) => Number(item.quantidade_produzida ?? 0) > 0));

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
        id: i.id,
        produto_id: i.produto_id,
        descricao: i.descricao,
        quantidade: String(i.quantidade),
        preco_unitario: String(i.preco_unitario),
        custo_unitario: Number(i.custo_unitario),
        quantidade_produzida: Number(i.quantidade_produzida),
      })) ?? [],
  );
  const [salvando, setSalvando] = useState(false);
  const [pagamentos, setPagamentos] = useState<PedidoPagamento[]>([]);
  const [valorPagoAlterado, setValorPagoAlterado] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [salvandoRecebimento, setSalvandoRecebimento] = useState(false);
  const [pagamentoEmEdicao, setPagamentoEmEdicao] = useState<string | null>(null);
  const [rascunhoPagamento, setRascunhoPagamento] = useState({ valor: "", data: "", forma: "pix", observacoes: "" });
  const [salvandoEdicaoPagamento, setSalvandoEdicaoPagamento] = useState(false);
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const [novoCliente, setNovoCliente] = useState({ nome: "", telefone: "", endereco: "", observacoes: "" });
  const [recorrenciaDialogOpen, setRecorrenciaDialogOpen] = useState(false);
  const [salvandoRecorrencia, setSalvandoRecorrencia] = useState(false);
  const [recorrenciaForm, setRecorrenciaForm] = useState({ frequencia: "semanal" as "semanal" | "quinzenal" | "mensal", data_inicio: hojeISO(), data_fim: "", hora_entrega: "", observacoes: "" });
  useEffect(() => {
    if (!existente?.id) { setPagamentos([]); return; }
    let ativo = true;
    void supabase.from("pedido_pagamentos").select("*").eq("pedido_id", existente.id).order("data_pagamento", { ascending: false }).then(({ data, error }) => {
      if (!ativo) return;
      if (error) { toast.error("Não foi possível carregar os pagamentos registrados."); return; }
      setPagamentos((data ?? []) as PedidoPagamento[]);
    });
    return () => { ativo = false; };
  }, [existente?.id]);

  async function registrarRecebimento() {
    if (!existente || salvandoRecebimento) return;
    const valorTotalDesejado = Math.round(parseNum(f.valor_entrada) * 100) / 100;
    const totalPagamentosRegistrados = pagamentos.reduce((total, pagamento) => total + Number(pagamento.valor ?? 0), 0);
    const valorAtual = Math.round((existente.saldo_quitado ? t.venda : Math.min(Math.max(0, Math.max(Number(existente.valor_entrada ?? 0), totalPagamentosRegistrados)), t.venda)) * 100) / 100;
    const valor = Math.round((valorTotalDesejado - valorAtual) * 100) / 100;
    if (!(valor > 0)) {
      toast.error("Informe um total pago maior que o valor já registrado.");
      return;
    }
    if (valorTotalDesejado > t.venda + 0.009) {
      toast.error("O valor pago não pode ser maior que o total do pedido.");
      return;
    }
    setSalvandoRecebimento(true);
    try {
      const { error } = await supabase.rpc("registrar_recebimento_pedido", {
        p_pedido_id: existente.id,
        p_valor: valor,
        p_data_pagamento: dataPagamento,
        p_forma_pagamento: f.forma_pagamento,
      });
      if (error) throw new Error(error.message);
      const { data, error: loadError } = await supabase.from("pedido_pagamentos").select("*").eq("pedido_id", existente.id).order("data_pagamento", { ascending: false });
      if (loadError) throw new Error(loadError.message);
      setPagamentos((data ?? []) as PedidoPagamento[]);
      setF((atual) => ({ ...atual, valor_entrada: String(valorTotalDesejado), saldo_quitado: valorTotalDesejado >= t.venda }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pedidos"] }),
        qc.invalidateQueries({ queryKey: ["pedido-pagamentos"] }),
      ]);
      toast.success("Pagamento registrado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o pagamento.");
    } finally { setSalvandoRecebimento(false); }
  }

  function iniciarEdicaoPagamento(pagamento: PedidoPagamento) {
    setPagamentoEmEdicao(pagamento.id);
    setRascunhoPagamento({
      valor: String(pagamento.valor ?? ""),
      data: pagamento.data_pagamento,
      forma: pagamento.forma_pagamento,
      observacoes: pagamento.observacoes ?? "",
    });
  }

  async function salvarEdicaoPagamento() {
    if (!existente || !pagamentoEmEdicao || salvandoEdicaoPagamento) return;
    const valor = Math.round(parseNum(rascunhoPagamento.valor) * 100) / 100;
    if (!(valor > 0)) {
      toast.error("Informe um valor de pagamento maior que zero.");
      return;
    }
    if (!rascunhoPagamento.data || rascunhoPagamento.data > hojeISO()) {
      toast.error("Informe uma data de pagamento válida.");
      return;
    }
    setSalvandoEdicaoPagamento(true);
    try {
      const { error } = await supabase.rpc("editar_recebimento_pedido", {
        p_pagamento_id: pagamentoEmEdicao,
        p_valor: valor,
        p_data_pagamento: rascunhoPagamento.data,
        p_forma_pagamento: rascunhoPagamento.forma,
        p_observacoes: rascunhoPagamento.observacoes,
      });
      if (error) throw new Error(error.message);
      const { data, error: loadError } = await supabase.from("pedido_pagamentos").select("*").eq("pedido_id", existente.id).order("data_pagamento", { ascending: false });
      if (loadError) throw new Error(loadError.message);
      setPagamentos((data ?? []) as PedidoPagamento[]);
      const { data: pedidoAtualizado, error: pedidoError } = await supabase.from("pedidos").select("valor_entrada,saldo_quitado").eq("id", existente.id).single();
      if (pedidoError) throw new Error(pedidoError.message);
      setF((atual) => ({ ...atual, valor_entrada: String(pedidoAtualizado.valor_entrada ?? 0), saldo_quitado: Boolean(pedidoAtualizado.saldo_quitado) }));
      setPagamentoEmEdicao(null);
      await Promise.all([        qc.invalidateQueries({ queryKey: ["pedidos"] }),
        qc.invalidateQueries({ queryKey: ["pedido-pagamentos"] }),
      ]);
      toast.success("Pagamento atualizado e saldo recalculado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível editar o pagamento.");
    } finally {
      setSalvandoEdicaoPagamento(false);
    }
  }

  // Bloqueia cliques repetidos mesmo antes de o React atualizar o estado visual.
  const saveLock = useRef(false);

  // Abrir um pedido do catálogo marca como visto e apaga o alerta de pedido novo.
  useEffect(() => {
    if (!existente || existente.origem !== "catalogo" || existente.visualizado_em) return;
    void supabase.from("pedidos").update({ visualizado_em: new Date().toISOString() }).eq("id", existente.id)
      .then(({ error }) => { if (!error) void qc.invalidateQueries({ queryKey: ["pedidos-catalogo-novos"] }); });
  }, [existente, qc]);

  // A rota pode ser reutilizada quando o parâmetro $id muda. Recarrega o formulário
  // somente quando muda o pedido selecionado, sem apagar edições durante refetches.
  useEffect(() => {
    setValorPagoAlterado(false);
    setF({
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
    });
    setItens(
      existente?.pedido_itens.map((i) => ({
        id: i.id,
        produto_id: i.produto_id,
        descricao: i.descricao,
        quantidade: String(i.quantidade),
        preco_unitario: String(i.preco_unitario),
        custo_unitario: Number(i.custo_unitario),
        quantidade_produzida: Number(i.quantidade_produzida),
      })) ?? [],
    );
    // "Repetir pedido": /pedidos/novo?repetir=<id> pré-preenche cliente e itens de um pedido anterior,
    // com preço e custo atuais dos produtos. Nada é salvo até a confirmação no formulário.
    if (novo) {
      const repetirId = new URLSearchParams(window.location.search).get("repetir");
      const modelo = repetirId ? pedidos.find((p) => p.id === repetirId) : undefined;
      if (modelo) {
        setF((atual) => ({
          ...atual,
          cliente_id: modelo.cliente_id ?? "",
          hora_entrega: modelo.hora_entrega ?? "",
          forma_pagamento: modelo.forma_pagamento,
          taxa_entrega: String(modelo.taxa_entrega ?? "0"),
          observacoes: modelo.observacoes ?? "",
        }));
        setItens(modelo.pedido_itens.map((i) => {
          const produto = produtos.find((p) => p.id === i.produto_id && p.ativo);
          return {
            produto_id: produto?.id ?? null,
            descricao: i.descricao,
            quantidade: String(i.quantidade),
            preco_unitario: String(produto ? produto.preco_venda : i.preco_unitario),
            custo_unitario: produto ? +(custo.get(produto.id) ?? 0).toFixed(4) : 0,
            quantidade_produzida: 0,
          };
        }));
        toast.info(`Itens do pedido #${modelo.numero} copiados com os preços atuais. Escolha a data de entrega e salve.`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só reinicializa ao trocar o pedido, não em refetches.
  }, [id, existente?.id]);

  if (!novo && !existente) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-muted-foreground">Pedido não encontrado.</p>
        <Link to="/pedidos" search={{ filtro: undefined, dataInicial: undefined, dataFinal: undefined }} className="text-primary">Voltar aos pedidos</Link>
      </div>
    );
  }

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const setItem = (i: number, patch: Partial<Item>) => setItens((s) => s.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  // Alterar manualmente o valor recebido invalida a marcação anterior de saldo quitado.
  const setValorPago = (valor: string) => {
    setValorPagoAlterado(true);
    setF((s) => ({ ...s, valor_entrada: valor, saldo_quitado: false }));
  };
  const limparZeroAoFocar = (valor: string, atualizar: (valor: string) => void) => {
    if (/^0([,.]0+)?$/.test(valor.trim())) atualizar("");
  };

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
  // O resumo do cadastro rápido usa valores efetivamente recebidos limitados ao total.
  // Isso evita saldo negativo quando a entrada digitada ultrapassa o valor do pedido.
  const valorPagoEfetivo = f.saldo_quitado ? t.venda : Math.min(Math.max(0, parseNum(f.valor_entrada)), t.venda);
  const saldoPendente = f.saldo_quitado ? 0 : Math.max(0, t.venda - valorPagoEfetivo);

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

  function abrirCriacaoRecorrencia() {
    if (!f.cliente_id) { toast.error("Selecione um cliente antes de criar a recorrência."); return; }
    if (!f.data_entrega) { toast.error("Informe a data da primeira entrega."); return; }
    if (itens.length === 0 || itens.some((i) => !i.descricao.trim() || parseNum(i.quantidade) <= 0 || parseNum(i.preco_unitario) < 0)) {
      toast.error("Adicione itens válidos ao pedido antes de criar a recorrência."); return;
    }
    setRecorrenciaForm((atual) => ({ ...atual, data_inicio: f.data_entrega, hora_entrega: f.hora_entrega, observacoes: f.observacoes }));
    setRecorrenciaDialogOpen(true);
  }

  async function criarRecorrenciaDoPedido(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvandoRecorrencia) return;
    if (!f.cliente_id) { toast.error("Selecione um cliente."); return; }
    if (!recorrenciaForm.data_inicio || (recorrenciaForm.data_fim && recorrenciaForm.data_fim < recorrenciaForm.data_inicio)) {
      toast.error("Confira as datas da recorrência."); return;
    }
    if (itens.length === 0 || itens.length > 100 || itens.some((i) => !i.descricao.trim() || !Number.isFinite(parseNum(i.quantidade)) || parseNum(i.quantidade) <= 0 || !Number.isFinite(parseNum(i.preco_unitario)) || parseNum(i.preco_unitario) < 0)) {
      toast.error("Confira os itens e valores do pedido."); return;
    }
    setSalvandoRecorrencia(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabelas da migração 0024 ainda não estão nos tipos gerados.
      const db = supabase as any;
      const { data: recorrencia, error: erroRecorrencia } = await db.from("pedidos_recorrentes").insert({
        cliente_id: f.cliente_id,
        frequencia: recorrenciaForm.frequencia,
        data_inicio: recorrenciaForm.data_inicio,
        data_fim: recorrenciaForm.data_fim || null,
        hora_entrega: recorrenciaForm.hora_entrega || null,
        observacoes: recorrenciaForm.observacoes.trim() || null,
        ativa: true,
      }).select("id").single();
      if (erroRecorrencia) throw new Error(erroRecorrencia.message);
      const itensOcorrencia = itens.map((item) => ({
        produto_id: item.produto_id,
        descricao: item.descricao.trim(),
        quantidade: parseNum(item.quantidade),
        preco_unitario: parseNum(item.preco_unitario),
        custo_unitario: Number.isFinite(item.custo_unitario) ? item.custo_unitario : 0,
      }));
      const { error: erroOcorrencia } = await db.rpc("preparar_ocorrencia_recorrente", {
        p_recorrencia_id: recorrencia.id,
        p_data_entrega: recorrenciaForm.data_inicio,
        p_hora_entrega: recorrenciaForm.hora_entrega || null,
        p_itens: itensOcorrencia,
        p_observacoes: recorrenciaForm.observacoes.trim() || null,
      });
      if (erroOcorrencia) {
        throw new Error("A recorrência foi criada, mas a primeira entrega não foi preparada: " + erroOcorrencia.message);
      }
      toast.success("Recorrência criada com a primeira entrega preparada. Confirme-a na tela de Pedidos recorrentes para gerar o pedido normal.");
      setRecorrenciaDialogOpen(false);
      await qc.invalidateQueries({ queryKey: ["pedidos-recorrentes"] });
      navigate({ to: "/pedidos-recorrentes" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a recorrência.");
    } finally {
      setSalvandoRecorrencia(false);
    }
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
    if (saveLock.current) return;
    if (!f.data_entrega) return void toast.error("Informe a data de entrega antes de salvar.");
    if (itens.length === 0) return void toast.error("Adicione pelo menos um item.");
    if (itens.some((i) => !i.descricao.trim() || parseNum(i.quantidade) <= 0)) return void toast.error("Confira os itens: descrição e quantidade são obrigatórias.");
    saveLock.current = true;
    setSalvando(true);
    try {
      if (existente && temProducaoRegistrada) {
        if (itens.some((item) => !item.id)) throw new Error("Não é possível adicionar itens a um pedido com produção registrada. Edite somente os preços, o frete, o desconto e o valor pago.");
        if (pagamentos.length > 1 && valorPagoAlterado) {
          throw new Error("Este pedido tem vários recebimentos. Para manter o histórico correto, altere o valor de cada recebimento na seção Histórico de pagamentos.");
        }
        const valorPago = Math.round(parseNum(f.valor_entrada) * 100) / 100;
        if (valorPagoAlterado) {
          if (!Number.isFinite(valorPago) || valorPago < 0 || valorPago > t.venda + 0.009) {
            throw new Error("O valor pago deve ser igual ou maior que zero e não pode ultrapassar o total atual do pedido.");
          }
          if (pagamentos.length === 1) {
            const pagamento = pagamentos[0]!;
            const { error: pagamentoError } = await supabase.rpc("editar_recebimento_pedido", {
              p_pagamento_id: pagamento.id,
              p_valor: valorPago,
              p_data_pagamento: pagamento.data_pagamento,
              p_forma_pagamento: pagamento.forma_pagamento,
              p_observacoes: pagamento.observacoes ?? "",
            });
            if (pagamentoError) throw new Error(pagamentoError.message);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC adicionada pela migração 0028; tipos gerados ainda não foram atualizados.
            const db = supabase as any;
            const { error: pagamentoError } = await db.rpc("corrigir_valor_pago_pedido_com_producao", {
              p_pedido_id: existente.id,
              p_valor_pago: valorPago,
            });
            if (pagamentoError) throw new Error(pagamentoError.message);
          }
        }
        const { error: valoresError } = await supabase.rpc("editar_valores_pedido_com_producao", {
          p_pedido_id: existente.id,
          p_itens: itens.map((item) => ({ id: item.id, preco_unitario: Math.round(parseNum(item.preco_unitario) * 100) / 100 })),
          p_desconto: Math.round(parseNum(f.desconto) * 100) / 100,
          p_taxa_entrega: Math.round(parseNum(f.taxa_entrega) * 100) / 100,
        });
        if (valoresError) throw new Error(valoresError.message);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["pedidos"] }),
          qc.invalidateQueries({ queryKey: ["pedido-pagamentos"] }),
        ]);
        toast.success("Valores e pagamento atualizados sem alterar a produção ou o estoque.");
        navigate({ to: "/pedidos", search: { filtro: undefined, dataInicial: undefined, dataFinal: undefined } });
        return;
      }
      const payload = {
        cliente_id: f.cliente_id || null,
        data_entrega: f.data_entrega,
        hora_entrega: f.hora_entrega || null,
        status: f.status === "finalizado" ? "entregue" : f.status,
        forma_pagamento: f.forma_pagamento,
        valor_entrada: !novo && pagamentos.length > 0 ? Number(existente?.valor_entrada ?? parseNum(f.valor_entrada)) : parseNum(f.valor_entrada),
        saldo_quitado: !novo && pagamentos.length > 0 ? Boolean(existente?.saldo_quitado) : f.saldo_quitado,
        desconto: parseNum(f.desconto),
        taxa_entrega: parseNum(f.taxa_entrega),
        observacoes: f.observacoes.trim() || null,
      };
      const { data: pedidoSalvoId, error } = await supabase.rpc("salvar_pedido", {
        payload: novo && parseNum(f.valor_entrada) > 0 ? { ...payload, valor_entrada: 0, saldo_quitado: false } : payload,
        itens: itens.map((i) => ({
          produto_id: i.produto_id,
          descricao: i.descricao.trim(),
          quantidade: parseNum(i.quantidade),
          preco_unitario: parseNum(i.preco_unitario),
          custo_unitario: i.custo_unitario,
          // A coluna é NOT NULL: novos itens começam com zero produzido;
          // na edição, preserva a quantidade já registrada.
          quantidade_produzida: Number.isFinite(i.quantidade_produzida) ? i.quantidade_produzida : 0,
        })),
        ...(existente ? { registro_id: existente.id } : {}),      });
      if (error) throw error;
      if (novo && parseNum(f.valor_entrada) > 0) {
        const { error: recebimentoError } = await supabase.rpc("registrar_recebimento_pedido", {
          p_pedido_id: pedidoSalvoId,
          p_valor: Math.round(parseNum(f.valor_entrada) * 100) / 100,
          p_data_pagamento: dataPagamento,
          p_forma_pagamento: f.forma_pagamento,
          p_observacoes: "Entrada registrada na criação do pedido",
        });
        if (recebimentoError) {
          await qc.invalidateQueries({ queryKey: ["pedidos"] });
          toast.error("Pedido criado, mas a entrada não foi registrada: " + recebimentoError.message);
          navigate({ to: "/pedidos", search: { filtro: undefined, dataInicial: undefined, dataFinal: undefined } });
          return;
        }
      }
      await qc.invalidateQueries({ queryKey: ["pedidos"] });
      toast.success(novo ? "Pedido criado!" : "Pedido atualizado!");
      navigate({ to: "/pedidos", search: { filtro: undefined, dataInicial: undefined, dataFinal: undefined } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      saveLock.current = false;
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

  async function cancelarPedido() {
    if (!existente || !confirm(`Cancelar o pedido #${existente.numero}? O pedido será mantido no histórico.`)) return;
    const { error } = await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", existente.id);
    if (error) return void toast.error(`Não foi possível cancelar o pedido: ${error.message}`);
    await qc.invalidateQueries({ queryKey: ["pedidos"] });
    toast.success(`Pedido #${existente.numero} cancelado. O histórico foi preservado.`);
    navigate({ to: "/pedidos", search: { filtro: undefined, dataInicial: undefined, dataFinal: undefined } });
  }

  async function excluir() {
    if (!existente || !confirm(`Excluir o pedido #${existente.numero}?`)) return;
    const { error } = await supabase.from("pedidos").delete().eq("id", existente.id);
    if (error) return void toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["pedidos"] });
    toast.success("Pedido excluído.");
    navigate({ to: "/pedidos", search: { filtro: undefined, dataInicial: undefined, dataFinal: undefined } });
  }

  const cliente = clientes.find((c) => c.id === f.cliente_id);
  const whatsapp = cliente?.telefone ? `https://wa.me/55${cliente.telefone.replace(/\D/g, "").replace(/^55/, "")}` : null;

  return (
    <>
      <PageHeader
        title={novo ? "Novo pedido" : `Pedido #${existente?.numero}`}
        back="/pedidos"
        action={!novo && existente ? (
          <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => window.location.assign(`/pedidos/novo?repetir=${existente.id}`)}>
            <Copy className="size-4" /> Repetir pedido
          </Button>
        ) : undefined}
      />
      {novo && <OrderMessage onApply={aplicarRascunho} />}
      {existente?.origem === "catalogo" && (
        <div className="mb-4 space-y-1 rounded-xl border border-info/40 bg-info/10 p-3 text-sm">
          <p className="font-semibold">Pedido feito pelo catálogo online</p>
          <p>{existente.tipo_entrega === "entrega" ? `Entrega em: ${existente.endereco_entrega ?? "endereço não informado"}` : "Retirada na confeitaria"}</p>
          {existente.pagamento_informado_em && saldoPendente > 0.009 && (
            <p className="font-medium text-warning-foreground">O cliente avisou que pagou por Pix em {new Date(existente.pagamento_informado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. Confira no banco e toque em “Confirmar pagamento”.</p>
          )}
        </div>
      )}
      <Dialog open={recorrenciaDialogOpen} onOpenChange={(open) => { if (!salvandoRecorrencia) setRecorrenciaDialogOpen(open); }}>
        <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Repeat className="size-5" /> Criar recorrência</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Os itens e preços atuais serão usados como sugestão para a primeira entrega. Nenhum pedido normal será criado até você confirmar a ocorrência.</p>
          <form onSubmit={(e) => void criarRecorrenciaDoPedido(e)} className="space-y-3">
            <Field label="Cliente">
              <Input value={clientes.find((c) => c.id === f.cliente_id)?.nome ?? ""} readOnly className="h-11" />
            </Field>
            <Field label="Frequência da recorrência *">
              <NativeSelect required value={recorrenciaForm.frequencia} onChange={(e) => setRecorrenciaForm((atual) => ({ ...atual, frequencia: e.target.value as typeof atual.frequencia }))}>
                <option value="semanal">Semanal (a cada 7 dias)</option>
                <option value="quinzenal">Quinzenal (a cada 14 dias)</option>
                <option value="mensal">Mensal</option>
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primeira entrega *">
                <Input type="date" required value={recorrenciaForm.data_inicio} onChange={(e) => setRecorrenciaForm((atual) => ({ ...atual, data_inicio: e.target.value }))} className="h-11" />
              </Field>
              <Field label="Horário">
                <Input type="time" value={recorrenciaForm.hora_entrega} onChange={(e) => setRecorrenciaForm((atual) => ({ ...atual, hora_entrega: e.target.value }))} className="h-11" />
              </Field>
              <Field label="Repetir até (opcional)">
                <Input type="date" min={recorrenciaForm.data_inicio} value={recorrenciaForm.data_fim} onChange={(e) => setRecorrenciaForm((atual) => ({ ...atual, data_fim: e.target.value }))} className="h-11" />
              </Field>
            </div>
            <Field label="Observações padrão (opcional)">
              <Textarea rows={2} value={recorrenciaForm.observacoes} onChange={(e) => setRecorrenciaForm((atual) => ({ ...atual, observacoes: e.target.value }))} placeholder="Instruções para as entregas" />
            </Field>
            <div className="rounded-lg border p-3 text-sm">
              <p className="mb-1 flex items-center gap-2 font-medium"><CalendarClock className="size-4" /> Itens da primeira entrega</p>
              {itens.map((item, index) => <p key={`${item.produto_id ?? item.descricao}-${index}`} className="text-muted-foreground">{parseNum(item.quantidade)}× {item.descricao} — {brl(parseNum(item.quantidade) * parseNum(item.preco_unitario))}</p>)}
              <p className="mt-2 font-semibold">Total estimado: {brl(itens.reduce((total, item) => total + parseNum(item.quantidade) * parseNum(item.preco_unitario), 0) + parseNum(f.taxa_entrega) - parseNum(f.desconto))}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={salvandoRecorrencia} onClick={() => setRecorrenciaDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1" disabled={salvandoRecorrencia}>{salvandoRecorrencia ? "Criando..." : "Criar recorrência"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
            <NativeSelect value={f.cliente_id} disabled={temProducaoRegistrada} onChange={(e) => set("cliente_id", e.target.value)}>
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
              <Input type="date" value={f.data_entrega} disabled={temProducaoRegistrada} onChange={(e) => set("data_entrega", e.target.value)} className="h-11" />
            </Field>
            <Field label="Horário">
              <Input type="time" value={f.hora_entrega} disabled={temProducaoRegistrada} onChange={(e) => set("hora_entrega", e.target.value)} className="h-11" />
            </Field>
          </div>
          <Field label="Status do pedido">
            {existente && f.status !== "cancelado" ? (
              <NativeSelect
                value={f.status === "finalizado" ? "entregue" : f.status === "confirmado" ? "recebido" : f.status}
                disabled={temProducaoRegistrada}
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
          {temProducaoRegistrada && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Este pedido já tem produção registrada. Para preservar o histórico e o estoque, somente os preços unitários, o frete e o desconto podem ser alterados.</p>}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Itens</h2>
            <Button
              size="sm"
              variant="outline"
              disabled={temProducaoRegistrada}
              onClick={() => setItens((s) => [...s, { produto_id: null, descricao: "", quantidade: "1", preco_unitario: "0", custo_unitario: 0, quantidade_produzida: 0 }])}
            >
              <Plus className="size-4" /> Item
            </Button>
          </div>
          {itens.length === 0 && <p className="text-sm text-muted-foreground">Toque em “Item” para adicionar produtos.</p>}
          {itens.map((it, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-muted/60 p-3">
              <div className="flex gap-2">
                <NativeSelect value={it.produto_id ?? ""} disabled={temProducaoRegistrada} onChange={(e) => escolherProduto(i, e.target.value)}>
                  <option value="">Produto avulso</option>
                  {produtos.filter((p) => p.ativo || p.id === it.produto_id).map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </NativeSelect>
                <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" disabled={temProducaoRegistrada} onClick={() => setItens((s) => s.filter((_, j) => j !== i))} aria-label="Remover item">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
              <Input placeholder="Descrição / personalização" value={it.descricao} disabled={temProducaoRegistrada} onChange={(e) => setItem(i, { descricao: e.target.value })} className="h-11 bg-card" />
              <div className="grid grid-cols-3 gap-2">
                <Field label="Qtd.">
                  <Input inputMode="decimal" value={it.quantidade} disabled={temProducaoRegistrada} onFocus={() => limparZeroAoFocar(it.quantidade, (valor) => setItem(i, { quantidade: valor }))} onChange={(e) => setItem(i, { quantidade: e.target.value })} className="h-11 bg-card" />                </Field>
                <Field label="Preço un.">
                  <Input inputMode="decimal" value={it.preco_unitario} onFocus={() => limparZeroAoFocar(it.preco_unitario, (valor) => setItem(i, { preco_unitario: valor }))} onChange={(e) => setItem(i, { preco_unitario: e.target.value })} className="h-11 bg-card" />
                </Field>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Total {brl(parseNum(it.quantidade) * parseNum(it.preco_unitario))}
              </div>
              <AvisoPrecoItem item={it} margemDesejada={Number(produtos.find((p) => p.id === it.produto_id)?.margem_desejada ?? 0)} />
            </div>
          ))}
        </Card>

        {novo ? (
          <>
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Pagamento e resumo</h2>
                <PagamentoBadge status={f.status} venda={t.venda} recebido={valorPagoEfetivo} saldo={saldoPendente} className="px-2.5 py-1" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Forma de pagamento">
                  <NativeSelect value={f.forma_pagamento} disabled={temProducaoRegistrada} onChange={(e) => set("forma_pagamento", e.target.value)}>
                    {FORMAS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Entrada / valor pago (R$)">
                  <Input inputMode="decimal" value={f.valor_entrada} disabled={pagamentos.length > 0} onFocus={() => limparZeroAoFocar(f.valor_entrada, setValorPago)} onChange={(e) => setValorPago(e.target.value)} className="h-11" />
                </Field>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <Row label="Total do pedido" value={brl(t.venda)} strong />
                <Row label="Entrada / valor pago" value={brl(valorPagoEfetivo)} />
                <div className="my-2 border-t" />
                <Row label="Saldo pendente" value={brl(saldoPendente)} strong />
              </div>
            </Card>

            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">Opções adicionais</summary>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Taxa de entrega (R$)">
                    <Input inputMode="decimal" value={f.taxa_entrega} onFocus={() => limparZeroAoFocar(f.taxa_entrega, (valor) => set("taxa_entrega", valor))} onChange={(e) => set("taxa_entrega", e.target.value)} className="h-11" />
                  </Field>
                  <Field label="Desconto (R$)">
                    <Input inputMode="decimal" value={f.desconto} onFocus={() => limparZeroAoFocar(f.desconto, (valor) => set("desconto", valor))} onChange={(e) => set("desconto", e.target.value)} className="h-11" />
                  </Field>
                </div>
                <Field label="Observações e personalizações">
                  <Textarea rows={3} value={f.observacoes} disabled={temProducaoRegistrada} onChange={(e) => set("observacoes", e.target.value)} placeholder="Ex.: escrever 'Parabéns Ana', sem lactose..." />
                </Field>
              </div>
            </details>
          </>
        ) : (
          <>
            <Card className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Pagamento</h2>
                </div>
                <PagamentoBadge status={f.status} venda={t.venda} recebido={valorPagoEfetivo} saldo={saldoPendente} className="shrink-0 px-2.5 py-1" />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Forma de pagamento">
                  <NativeSelect value={f.forma_pagamento} disabled={temProducaoRegistrada} onChange={(e) => set("forma_pagamento", e.target.value)}>
                    {FORMAS.map((forma) => (
                      <option key={forma.value} value={forma.value}>{forma.label}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Valor já pago (R$)">
                  <Input inputMode="decimal" value={f.valor_entrada} disabled={pagamentos.length > 1} onFocus={() => limparZeroAoFocar(f.valor_entrada, setValorPago)} onChange={(e) => setValorPago(e.target.value)} className="h-11" />
                  {pagamentos.length > 1 && <p className="text-xs text-muted-foreground">Edite cada recebimento individualmente no histórico abaixo.</p>}
                </Field>
                <Field label="Frete (R$)">
                  <Input inputMode="decimal" value={f.taxa_entrega} onFocus={() => limparZeroAoFocar(f.taxa_entrega, (valor) => set("taxa_entrega", valor))} onChange={(e) => set("taxa_entrega", e.target.value)} className="h-11" />
                </Field>
                <Field label="Desconto (R$)">
                  <Input inputMode="decimal" value={f.desconto} onFocus={() => limparZeroAoFocar(f.desconto, (valor) => set("desconto", valor))} onChange={(e) => set("desconto", e.target.value)} className="h-11" />
                </Field>
                <Field label="Data de pagamento">
                  <Input type="date" value={dataPagamento} disabled={temProducaoRegistrada} max={hojeISO()} onChange={(e) => setDataPagamento(e.target.value)} className="h-11" />
                </Field>
              </div>

              <div className="rounded-xl border bg-muted/40 p-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] leading-4 text-muted-foreground">Total do pedido</p>
                    <p className="mt-1 break-words text-sm font-bold tabular-nums sm:text-base">{brl(t.venda)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-4 text-muted-foreground">Já recebido</p>
                    <p className="mt-1 break-words text-sm font-bold tabular-nums text-success sm:text-base">{brl(valorPagoEfetivo)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] leading-4 text-muted-foreground">Em aberto</p>
                    <p className="mt-1 break-words text-sm font-bold tabular-nums sm:text-base">{brl(saldoPendente)}</p>
                  </div>
                </div>
                <div className="my-3 border-t" />
                <Row label="Subtotal dos produtos" value={brl(t.subtotal)} />
                <Row label="Frete" value={brl(parseNum(f.taxa_entrega))} />
                <Row label="Desconto" value={`− ${brl(parseNum(f.desconto))}`} />
                <div className="my-2 border-t" />
                <Row label="Total final" value={brl(t.venda)} strong />
              </div>

              {existente?.status !== "cancelado" && t.venda > 0 && (valorPagoEfetivo < t.venda - 0.009 || Number(existente?.valor_entrada ?? 0) < t.venda - 0.009) && (
                <Button type="button" className="h-11 w-full" disabled={salvandoRecebimento} onClick={() => void registrarRecebimento()}>
                  {salvandoRecebimento ? "Confirmando..." : "Confirmar pagamento"}
                </Button>
              )}

              {pagamentos.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Histórico de pagamentos</h3>
                  <div className="divide-y rounded-lg border">
                    {pagamentos.map((pagamento) => (
                      <div key={pagamento.id} className="space-y-3 p-3 text-sm">
                        {pagamentoEmEdicao === pagamento.id ? (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Valor do pagamento (R$)">
                              <Input inputMode="decimal" value={rascunhoPagamento.valor} onChange={(e) => setRascunhoPagamento((atual) => ({ ...atual, valor: e.target.value }))} className="h-10" />
                            </Field>
                            <Field label="Data do pagamento">
                              <Input type="date" max={hojeISO()} value={rascunhoPagamento.data} onChange={(e) => setRascunhoPagamento((atual) => ({ ...atual, data: e.target.value }))} className="h-10" />
                            </Field>
                            <Field label="Forma de pagamento">
                              <NativeSelect value={rascunhoPagamento.forma} onChange={(e) => setRascunhoPagamento((atual) => ({ ...atual, forma: e.target.value }))}>
                                {FORMAS.map((forma) => <option key={forma.value} value={forma.value}>{forma.label}</option>)}
                              </NativeSelect>
                            </Field>
                            <Field label="Observações">
                              <Input value={rascunhoPagamento.observacoes} onChange={(e) => setRascunhoPagamento((atual) => ({ ...atual, observacoes: e.target.value }))} className="h-10" placeholder="Opcional" />
                            </Field>
                            <div className="flex gap-2 sm:col-span-2">
                              <Button type="button" className="h-10" disabled={salvandoEdicaoPagamento} onClick={() => void salvarEdicaoPagamento()}>{salvandoEdicaoPagamento ? "Salvando..." : "Salvar alteração"}</Button>
                              <Button type="button" variant="outline" className="h-10" disabled={salvandoEdicaoPagamento} onClick={() => setPagamentoEmEdicao(null)}>Cancelar</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium">{dataBR(pagamento.data_pagamento)} · {FORMAS.find((forma) => forma.value === pagamento.forma_pagamento)?.label ?? pagamento.forma_pagamento}</p>
                              {pagamento.observacoes && <p className="mt-1 text-xs text-muted-foreground">{pagamento.observacoes}</p>}
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="shrink-0 font-semibold tabular-nums">{brl(Number(pagamento.valor))}</p>
                              <Button type="button" variant="outline" className="h-9" onClick={() => iniciarEdicaoPagamento(pagamento)}>Editar</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </Card>

            <Card>
              <Field label="Observações e personalizações">
                <Textarea rows={3} value={f.observacoes} disabled={temProducaoRegistrada} onChange={(e) => set("observacoes", e.target.value)} placeholder="Ex.: escrever 'Parabéns Ana', sem lactose..." />
              </Field>
            </Card>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          {novo && <Button type="button" variant="outline" className="h-12" onClick={abrirCriacaoRecorrencia} disabled={salvando}><Repeat className="size-4" /> Criar recorrência</Button>}
          {!novo && existente && !["entregue", "finalizado", "cancelado"].includes(existente.status) && (
            <Button variant="outline" className="h-12 text-destructive" onClick={cancelarPedido}>
              Cancelar pedido
            </Button>
          )}
          {!novo && (
            <Button variant="outline" className="h-12 text-destructive" onClick={excluir} aria-label="Excluir pedido">
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="h-12 flex-1 text-base" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : temProducaoRegistrada ? "Salvar valores" : "Salvar pedido"}
          </Button>
        </div>
      </div>
    </>
  );
}
/** Avisa no item quando o preço combinado fica abaixo do custo ou da margem desejada do produto. */
function AvisoPrecoItem({ item, margemDesejada }: { item: Item; margemDesejada: number }) {
  if (!item.produto_id) return null;
  if (!(item.custo_unitario > 0)) {
    return <p className="text-xs text-muted-foreground">Custo não registrado neste item: o lucro deste pedido pode aparecer maior do que é.</p>;
  }
  const alerta = alertaMargem(item.custo_unitario, parseNum(item.preco_unitario), margemDesejada);
  if (alerta.abaixoDoCusto) {
    return <p role="alert" className="text-xs font-medium text-destructive">Preço abaixo do custo ({brl(item.custo_unitario)}): este item dá prejuízo.</p>;
  }
  if (alerta.abaixoDaMargem) {
    return <p className="text-xs text-warning-foreground">Abaixo da margem desejada de {margemDesejada}%. Preço sugerido: {brl(alerta.sugerido)}.</p>;
  }
  return null;
}
