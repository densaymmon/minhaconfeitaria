import * as appQueries from "@/lib/queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShoppingCart, FileUp, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, dataBR, hojeISO } from "@/lib/format";
import { medida, medidaLabel, medidasCompativeis, numeroIngrediente } from "@/lib/ingredient-cost";
import { Card, Empty, Field, PageHeader } from "@/components/app/ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DOCUMENT_ACCEPT, parseInvoiceXml, possibleDuplicate, reviewDocument, validateDocumentFile, type PurchaseDocument } from "@/lib/purchase-document";
import { PurchaseDocumentReview } from "@/components/app/purchase-document-review";
import { readPurchaseDocumentLocally } from "@/lib/purchase-document-ocr";

export const Route = createFileRoute("/_authenticated/compras")({
  validateSearch: (search: Record<string, unknown>) => ({
    secao: search["secao"] === "integracao" || search["secao"] === "estoque" || search["secao"] === "gastos" ? search["secao"] : "compras",
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(appQueries.insumosQ),
      context.queryClient.ensureQueryData(appQueries.comprasQ),
      context.queryClient.ensureQueryData(appQueries.compraItensQ),
      context.queryClient.ensureQueryData(appQueries.contasPagarQ),
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
  component: ComprasPage,
});

function ComprasPage() {
  const { secao } = Route.useSearch();
  return <Compras key={secao} initialSection={secao} />;
}

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


export function Compras({ embedded = false, initialSection = "compras" }: { embedded?: boolean; initialSection?: "compras" | "gastos" | "integracao" | "estoque" }) {
  const [secao, setSecao] = useState<"compras" | "gastos" | "integracao" | "estoque">(initialSection);
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: compras } = useSuspenseQuery(appQueries.comprasQ);
  const { data: itens } = useSuspenseQuery(appQueries.compraItensQ);
  const { data: contasPagar } = useSuspenseQuery(appQueries.contasPagarQ);
  const { data: estoque = [], isLoading: carregandoEstoque, error: erroEstoque, refetch: recarregarEstoque } = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_estoque");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const { data: pedidos = [] } = useQuery(appQueries.pedidosQ);
  const { data: produtos = [] } = useQuery(appQueries.produtosQ);
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
  const [inventarioUnidade, setInventarioUnidade] = useState<Record<string, string>>({});
  const eventoInventarioRef = useRef<{ assinatura: string; id: string } | null>(null);
  const eventoCancelarRef = useRef<{ compraId: string; id: string } | null>(null);
  const eventoExcluirRef = useRef<{ compraId: string; id: string } | null>(null);
  const [editandoCompraId, setEditandoCompraId] = useState<string | null>(null);
  const [compraParaExcluir, setCompraParaExcluir] = useState<{ id: string; cancelada_em: string | null } | null>(null);
  const formularioCompraRef = useRef<HTMLFormElement | null>(null);

  // Ao iniciar uma edição, leve o formulário para o início da área de registro.
  useEffect(() => {
    // O histórico fica na seção "gastos" e o formulário na seção "compras".
    // Só tente rolar depois que a navegação montar o formulário de edição.
    if (editandoCompraId && secao === "compras") {
      formularioCompraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editandoCompraId, secao]);
  const [documentoCompra, setDocumentoCompra] = useState<PurchaseDocument | null>(null);
  const [arquivoDocumento, setArquivoDocumento] = useState("");
  const [erroDocumento, setErroDocumento] = useState("");
  const [processandoDocumento, setProcessandoDocumento] = useState(false);
  const [confirmandoDocumento, setConfirmandoDocumento] = useState(false);
  const documentReview = documentoCompra ? reviewDocument(documentoCompra, insumos) : null;
  const possibleExistingPurchase = documentoCompra ? possibleDuplicate(documentoCompra, compras) : undefined;
  const [acknowledgedReview, setAcknowledgedReview] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [buscaHistorico, setBuscaHistorico] = useState("");

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

  // Simulação somente de leitura: compras não canceladas menos consumo calculado pelas receitas atuais.
  // Pedidos entregues/finalizados sem produção registrada usam a quantidade pedida; pedidos em produção
  // usam somente a quantidade efetivamente registrada. Nenhum saldo é alterado até confirmar o inventário.
  const estoqueTeorico = useMemo(() => {
    const saldo = new Map<string, number>();
    for (const insumo of insumos) saldo.set(insumo.id, 0);

    for (const compra of compras) {
      if (compra.cancelada_em) continue;
      for (const item of itens) {
        if (item.compra_id !== compra.id) continue;
        const unidadeCompra = medida(item.unidade ?? "");
        const insumo = insumos.find((i) => i.id === item.insumo_id);
        const unidadeInsumo = medida(String(insumo?.unidade_embalagem ?? insumo?.unidade ?? "un"));
        if (!unidadeCompra || !unidadeInsumo || unidadeCompra.base !== unidadeInsumo.base) continue;
        saldo.set(item.insumo_id, (saldo.get(item.insumo_id) ?? 0) + Number(item.quantidade || 0) * unidadeCompra.fator);
      }
    }

    const produtosPorId = new Map(produtos.map((produto) => [produto.id, produto]));
    for (const pedido of pedidos) {
      const entregue = ["entregue", "finalizado"].includes(String(pedido.status).toLowerCase());
      for (const item of pedido.pedido_itens ?? []) {
        const registrada = Number(item.quantidade_produzida ?? 0);
        if (!entregue && registrada <= 0) continue;
        const quantidadeProduzida = entregue && registrada <= 0 ? Number(item.quantidade ?? 0) : registrada;
        if (!Number.isFinite(quantidadeProduzida) || quantidadeProduzida <= 0) continue;
        if (!item.produto_id) continue;
        const produto = produtosPorId.get(item.produto_id);
        const rendimento = Number(produto?.rendimento ?? 0);
        if (!produto || !Number.isFinite(rendimento) || rendimento <= 0) continue;
        for (const receita of produto.receita_itens ?? []) {
          const quantidadeReceita = Number(receita.quantidade_utilizada ?? receita.quantidade ?? 0);
          const unidadeReceita = medida(receita.unidade_receita ?? "");
          if (!unidadeReceita || !Number.isFinite(quantidadeReceita) || quantidadeReceita <= 0) continue;
          const consumo = quantidadeReceita * unidadeReceita.fator * quantidadeProduzida / rendimento;
          saldo.set(receita.insumo_id, (saldo.get(receita.insumo_id) ?? 0) - consumo);
        }
      }
    }

    return Object.fromEntries(saldo.entries()) as Record<string, number>;
  }, [insumos, compras, itens, pedidos, produtos]);

  const comprasPeriodo = compras.filter((c) => noPeriodo(c.data_compra));
  const termoHistorico = buscaHistorico.trim().toLocaleLowerCase("pt-BR");
  const comprasHistoricoFiltradas = comprasPeriodo.filter((compra) => {
    if (!termoHistorico) return true;
    const itensCompra = itens.filter((item) => item.compra_id === compra.id);
    const texto = [compra.local_compra, compra.data_compra, ...itensCompra.map((item) => insumos.find((insumo) => insumo.id === item.insumo_id)?.nome ?? "insumo removido")].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    return texto.includes(termoHistorico) || compra.data_compra.split("-").reverse().join("/").includes(termoHistorico);
  });
  const comprasNoPeriodo = comprasPeriodo.filter((c) => !c.cancelada_em);
  const idsNoPeriodo = new Set(comprasNoPeriodo.map((c) => c.id));
  const itensNoPeriodo = itens.filter((i) => idsNoPeriodo.has(i.compra_id));
  const totalPeriodo = itensNoPeriodo.reduce((s, i) => s + Number(i.total), 0);

  // Auditoria somente de leitura. Cada área apresenta seu próprio resultado e cobertura.
  // Compras antigas sem vínculo automático são classificadas como não verificáveis por esta regra,
  // e não como aprovadas ou como erro confirmado.
  const auditoriaIntegracao = useMemo(() => {
    type CategoriaAuditoria = "financeiro" | "parcelas" | "canceladas";
    const problemas: { id: string; mensagem: string; categoria: CategoriaAuditoria }[] = [];
    const limiteIntegracao = "2026-10-15";
    let comprasSemVinculoAntigas = 0;
    let comprasFinanceiroVerificadas = 0;
    let comprasParcelasVerificadas = 0;
    let comprasCanceladasVerificadas = 0;

    for (const compra of compras) {
      // Todas as contas vinculadas são consideradas para detectar sobras, inclusive as manuais.
      const contasDaCompra = contasPagar.filter((conta) => conta.compra_id === compra.id);
      const contasAtivas = contasDaCompra.filter((conta) =>
        !conta.cancelada_em && conta.status !== "cancelado"
      );
      const contasAutomaticas = contasDaCompra.filter((conta) => conta.gerada_automaticamente);
      const totalContasAtivas = contasAtivas.reduce((s, conta) => s + (Number(conta.valor) || 0), 0);
      const totalCentavos = Math.round((Number(compra.total) || 0) * 100);
      const totalContasCentavos = Math.round(totalContasAtivas * 100);
      const criadaEm = typeof compra.created_at === "string" ? compra.created_at.slice(0, 10) : "";
      const compraRecente = criadaEm >= limiteIntegracao;

      if (compra.cancelada_em) {
        comprasCanceladasVerificadas += 1;
        if (contasAtivas.length > 0) {
          problemas.push({
            id: compra.id + "-cancelada-com-conta",
            categoria: "canceladas",
            mensagem: `Compra de ${dataBR(compra.data_compra)} cancelada, mas ainda possui ${contasAtivas.length} conta(s) ativa(s) vinculada(s).`,
          });
        }
        continue;
      }

      if (contasAutomaticas.length === 0) {
        if (compraRecente) {
          problemas.push({
            id: compra.id + "-sem-conta",
            categoria: "financeiro",
            mensagem: `Compra de ${dataBR(compra.data_compra)} sem conta financeira automática vinculada.`,
          });
        } else {
          comprasSemVinculoAntigas += 1;
        }
        // Sem vínculo automático, não é seguro afirmar que parcelas ou pagamentos foram conferidos.
        continue;
      }

      comprasFinanceiroVerificadas += 1;
      if (compra.forma_pagamento_compra === "credito") {
        comprasParcelasVerificadas += 1;
        const parcelasEsperadas = Number(compra.numero_parcelas) || 1;
        if (contasAtivas.length !== parcelasEsperadas) {
          problemas.push({
            id: compra.id + "-parcelas",
            categoria: "parcelas",
            mensagem: `Compra de ${dataBR(compra.data_compra)}: esperadas ${parcelasEsperadas} parcela(s), encontradas ${contasAtivas.length} ativa(s).`,
          });
        }
        if (totalContasCentavos !== totalCentavos) {
          problemas.push({
            id: compra.id + "-total-parcelas",
            categoria: "parcelas",
            mensagem: `Compra de ${dataBR(compra.data_compra)}: total das parcelas (${brl(totalContasAtivas)}) difere do total comprado (${brl(Number(compra.total) || 0)}).`,
          });
        }
      } else if (compraRecente) {
        if (totalContasCentavos !== totalCentavos) {
          problemas.push({
            id: compra.id + "-total-avista",
            categoria: "financeiro",
            mensagem: `Compra à vista de ${dataBR(compra.data_compra)}: conta vinculada totaliza ${brl(totalContasAtivas)}, mas a compra foi de ${brl(Number(compra.total) || 0)}.`,
          });
        }
        const totalPagoCentavos = Math.round(contasAtivas.reduce((s, conta) => s + (Number(conta.valor_pago) || 0), 0) * 100);
        if (totalPagoCentavos !== totalCentavos) {
          problemas.push({
            id: compra.id + "-pagamento-avista",
            categoria: "financeiro",
            mensagem: `Compra à vista de ${dataBR(compra.data_compra)} não aparece totalmente paga no financeiro.`,
          });
        }
      }
    }

    const porCategoria = (categoria: CategoriaAuditoria) => problemas.filter((p) => p.categoria === categoria);
    return {
      problemas,
      financeiro: porCategoria("financeiro"),
      parcelas: porCategoria("parcelas"),
      canceladas: porCategoria("canceladas"),
      comprasSemVinculoAntigas,
      comprasFinanceiroVerificadas,
      comprasParcelasVerificadas,
      comprasCanceladasVerificadas,
    };
  }, [compras, contasPagar]);

  const estoqueNegativo = estoque.filter((item) => Number(item.saldo) < 0);

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
    const itensInventario = preenchidos.map((item) => {
      const unidadeDigitada = inventarioUnidade[item.insumo_id] ?? item.unidade_base!;
      const conversao = medida(unidadeDigitada);
      if (!conversao || conversao.base !== item.unidade_base) {
        throw new Error(`A unidade informada para ${item.nome} não corresponde ao estoque.`);
      }
      return {
        insumo_id: item.insumo_id,
        quantidade_fisica: numeroIngrediente(inventarioFisico[item.insumo_id] ?? "") * conversao.fator,
        unidade_base: item.unidade_base!,
      };
    });
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
      const { error } = await supabase.rpc("registrar_inventario_fisico" as never, {
        itens: itensInventario,
        evento_id: eventoInventarioRef.current.id,
      } as never);
      if (error) throw error;
      eventoInventarioRef.current = null;
      setInventarioFisico({});
      await qc.invalidateQueries({ queryKey: ["estoque"] });
      toast.success("Contagem física registrada e saldo ajustado.");
    } catch (erro) {
      // Supabase/PostgREST retorna erros como objetos simples, não necessariamente Error.
      // Mostrar a mensagem do banco evita esconder a causa real atrás de um aviso genérico.
      const detalhe =
        typeof erro === "object" && erro !== null && "message" in erro && typeof erro.message === "string"
          ? erro.message
          : erro instanceof Error
            ? erro.message
            : typeof erro === "string"
              ? erro
              : "";
      toast.error(detalhe || "Não foi possível registrar o inventário. Verifique os dados e tente novamente.");
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

    // Alerta de possível duplicidade antes de registrar uma nova compra. A comparação
    // usa data, local, total e itens para reduzir falsos positivos; nunca bloqueia à força.
    if (!editandoCompraId) {
      const assinaturaItensNovos = calculadas
        .map((linha) => {
          const conversao = medida(linha.unidade);
          const quantidadeBase = linha.quantidadeNumerica * (conversao?.fator ?? 1);
          return `${linha.insumo_id}:${Math.round(quantidadeBase * 1_000_000)}:${Math.round(linha.total * 100)}`;
        })
        .sort()
        .join("|");
      const localNormalizado = localCompra.trim().toLocaleLowerCase("pt-BR");
      const compraPossivelmenteDuplicada = compras.find((compra) => {
        if (compra.cancelada_em || compra.data_compra !== data) return false;
        if ((compra.local_compra ?? "").trim().toLocaleLowerCase("pt-BR") !== localNormalizado) return false;
        if (Math.round((Number(compra.total) || 0) * 100) !== Math.round(total * 100)) return false;
        const itensExistentes = itens.filter((item) => item.compra_id === compra.id);
        if (itensExistentes.length !== calculadas.length) return false;
        const assinaturaItensExistentes = itensExistentes
          .map((item) => {
            const conversao = medida(item.unidade ?? "");
            const quantidadeBase = Number(item.quantidade) * (conversao?.fator ?? 1);
            return `${item.insumo_id}:${Math.round(quantidadeBase * 1_000_000)}:${Math.round((Number(item.total) || 0) * 100)}`;
          })
          .sort()
          .join("|");
        return assinaturaItensExistentes === assinaturaItensNovos;
      });

      if (compraPossivelmenteDuplicada && !window.confirm(
        `Atenção: já existe uma compra com a mesma data, local, total e itens (registro de ${dataBR(compraPossivelmenteDuplicada.data_compra)}). Deseja registrar outra compra mesmo assim?`,
      )) return;
    }

    setBusy(true);
    let preservarFinanceiroExistente = false;
    try {
      // Toda compra editada deve reconciliar seus lançamentos financeiros,
      // mesmo sem pagamentos anteriores. Isso permite alterar qualquer valor,
      // data e forma de pagamento sem deixar parcelas antigas inconsistentes.
      if (editandoCompraId) {
        const compraOriginal = compras.find((compra) => compra.id === editandoCompraId);
        if (!compraOriginal) throw new Error("Não foi possível localizar a compra original. Atualize a tela e tente novamente.");
        preservarFinanceiroExistente = true;
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
      if (typeof compraSalvaId !== "string" || !compraSalvaId) throw new Error("A compra foi processada sem retornar seu identificador.");
      const idCompraSalva = compraSalvaId as string;
      const { error: erroLocal } = await supabase.rpc("registrar_local_compra", {
        registro_id: idCompraSalva,
        local_compra: localCompra.trim(),
      });
      if (erroLocal) throw erroLocal;
      if (preservarFinanceiroExistente) {
        // Reconcilia o saldo futuro sem editar ou apagar os lançamentos de pagamento
        // já realizados. A função também atualiza as condições financeiras da compra.
        const { error: erroFinanceiro } = await supabase.rpc("reconciliar_compra_com_pagamentos", {
          p_compra_id: idCompraSalva,
          p_forma_pagamento: formaPagamentoCompra,
          p_numero_parcelas: formaPagamentoCompra === "credito" ? Number(numeroParcelasCompra) : 1,
          p_primeiro_vencimento: formaPagamentoCompra === "credito" ? primeiroVencimentoCompra : data,
        });
        if (erroFinanceiro) throw erroFinanceiro;
      } else {
        const { error: erroFinanceiro } = await supabase.rpc("registrar_pagamento_compra", {
          p_compra_id: idCompraSalva,
          p_forma_pagamento: formaPagamentoCompra,
          p_numero_parcelas: formaPagamentoCompra === "credito" ? Number(numeroParcelasCompra) : 1,
          p_primeiro_vencimento: formaPagamentoCompra === "credito" ? primeiroVencimentoCompra : data,
        });
        if (erroFinanceiro) throw erroFinanceiro;
      }
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
      {!embedded && <PageHeader title={secao === "integracao" ? "Conferência de integração" : secao === "estoque" ? "Controle de estoque" : "Compras de insumos"} back="/mais" />}

      {secao === "integracao" && <section className="mb-8 rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Conferência de integração</h2>
          <span className={auditoriaIntegracao.problemas.length || estoqueNegativo.length ? "rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive" : "rounded-full bg-muted px-2 py-1 text-xs font-semibold"}>
            {auditoriaIntegracao.problemas.length + estoqueNegativo.length} alerta(s)
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Conferência somente de leitura. Os resultados abaixo indicam o que foi verificado, o que apresentou divergência e o que ainda não pôde ser confirmado.
        </p>

        <div className="mb-3 space-y-2">
          {([
            { titulo: "Compras × financeiro", verificadas: auditoriaIntegracao.comprasFinanceiroVerificadas, problemas: auditoriaIntegracao.financeiro, detalhe: "Vínculo das compras com as contas a pagar e total pago nas compras à vista." },
            { titulo: "Parcelamentos", verificadas: auditoriaIntegracao.comprasParcelasVerificadas, problemas: auditoriaIntegracao.parcelas, detalhe: "Quantidade de parcelas ativas e soma dos valores em relação à compra." },
            { titulo: "Compras canceladas", verificadas: auditoriaIntegracao.comprasCanceladasVerificadas, problemas: auditoriaIntegracao.canceladas, detalhe: "Verifica se uma compra cancelada ainda possui contas a pagar ativas." },
          ] as const).map((grupo) => (
            <div key={grupo.titulo} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{grupo.titulo}</p>
                <span className={grupo.problemas.length ? "rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive" : "rounded-md bg-muted px-2 py-1 text-xs font-medium"}>
                  {grupo.problemas.length ? `${grupo.problemas.length} divergência(s)` : "Nenhuma divergência encontrada"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{grupo.detalhe} Itens verificados: {grupo.verificadas}.</p>
              {grupo.problemas.map((problema) => (
                <p key={problema.id} className="mt-2 rounded-md border border-destructive/30 p-2 text-sm">{problema.mensagem}</p>
              ))}
            </div>
          ))}
        </div>

        {auditoriaIntegracao.comprasSemVinculoAntigas > 0 && (
          <p className="mb-3 rounded-lg border border-amber-500/40 p-3 text-sm">
            Conferência parcial: {auditoriaIntegracao.comprasSemVinculoAntigas} compra(s) antiga(s) não possuem vínculo automático. Elas não foram consideradas aprovadas nem como erro confirmado; precisam de conferência manual no histórico financeiro.
          </p>
        )}

        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">Estoque negativo</p>
            <span className={estoqueNegativo.length ? "rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive" : "rounded-md bg-muted px-2 py-1 text-xs font-medium"}>
              {estoqueNegativo.length ? `${estoqueNegativo.length} insumo(s) com saldo negativo` : "Nenhum saldo negativo encontrado"}
            </span>
          </div>
          {estoqueNegativo.map((item) => (
            <div key={item.insumo_id} className="mt-2 rounded-md border border-amber-500/40 p-2 text-sm">
              <p className="font-medium">Estoque negativo: {item.nome}</p>
              <p className="text-xs text-muted-foreground">Saldo calculado: {Number(item.saldo).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {item.unidade_base ?? ""}. Confira entradas, produção e contagem física.</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Compras anteriores a 15/10/2026 sem vínculo automático ficam sinalizadas como conferência parcial. A tela não altera estoque, compras ou financeiro automaticamente e não substitui a conferência dos extratos.
        </p>
      </section>}

      {secao === "estoque" && <>
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Estoque atual</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          O saldo considera somente movimentações registradas após a ativação do controle de estoque. Compras antigas não são incluídas automaticamente.
        </p>
        {carregandoEstoque ? (
          <p className="py-3 text-sm text-muted-foreground">Carregando saldo...</p>
        ) : erroEstoque ? (
          <div role="alert" className="rounded-lg border p-3 text-sm text-destructive"><p>Não foi possível carregar o estoque: {erroEstoque instanceof Error ? erroEstoque.message : "tente novamente."}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void recarregarEstoque()}>Tentar novamente</Button></div>
        ) : estoque.length === 0 ? (
          <Empty>Nenhum insumo cadastrado. <Link to="/produtos" className="font-medium text-primary underline underline-offset-4">Cadastrar insumos</Link></Empty>
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
          O sistema sugere o saldo teórico (compras não canceladas menos consumo estimado pelas receitas atuais). Use “Preencher com estoque calculado” para carregar as sugestões, confira fisicamente e registre. Você pode informar em kg ou g, L ou ml, e dúzias ou unidades; o sistema converte para a unidade-base automaticamente. O registro ajusta apenas a diferença no histórico; não altera compras nem recalcula custos históricos. Saldos teóricos negativos são exibidos como zero para conferência física.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mb-3 h-10 w-full"
          disabled={busy || carregandoEstoque}
          onClick={() => {
            setInventarioFisico(Object.fromEntries(estoque.filter((item) => item.unidade_base).map((item) => {
              const estimado = Number(estoqueTeorico[item.insumo_id] ?? 0);
              return [item.insumo_id, String(Math.max(0, Number.isFinite(estimado) ? estimado : 0))];
            })));
            setInventarioUnidade(Object.fromEntries(estoque.filter((item) => item.unidade_base).map((item) => [item.insumo_id, item.unidade_base!])));
          }}
        >
          Preencher com estoque calculado
        </Button>
        <form onSubmit={salvarInventario} className="space-y-3">
          {estoque.map((item) => {
            const saldo = Number(item.saldo);
            const unidade = item.unidade_base;
            return (
              <div key={item.insumo_id} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 border-b pb-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="font-medium">{item.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Saldo atual registrado: {saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unidade ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Estimativa por compras e receitas: {Number(estoqueTeorico[item.insumo_id] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unidade ?? ""}
                    {Number(estoqueTeorico[item.insumo_id] ?? 0) < 0 ? " · negativo, confira fisicamente" : ""}
                  </p>
                </div>
                <div className="space-y-1 text-xs">
                  <label className="block text-muted-foreground" htmlFor={`inventario-unidade-${item.insumo_id}`}>Unidade digitada</label>
                  <select
                    id={`inventario-unidade-${item.insumo_id}`}
                    aria-label={`Unidade da quantidade física de ${item.nome}`}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    disabled={!unidade || busy}
                    value={inventarioUnidade[item.insumo_id] ?? unidade ?? "un"}
                    onChange={(e) => {
                      const novaUnidade = e.target.value;
                      const unidadeAnterior = inventarioUnidade[item.insumo_id] ?? unidade ?? "un";
                      const fatorAnterior = medida(unidadeAnterior)?.fator ?? 1;
                      const fatorNovo = medida(novaUnidade)?.fator ?? 1;
                      const valorAtual = inventarioFisico[item.insumo_id] ?? "";
                      const numeroAtual = numeroIngrediente(valorAtual);
                      setInventarioUnidade((s) => ({ ...s, [item.insumo_id]: novaUnidade }));
                      if (valorAtual.trim() && Number.isFinite(numeroAtual)) {
                        setInventarioFisico((s) => ({ ...s, [item.insumo_id]: String(numeroAtual * fatorAnterior / fatorNovo) }));
                      }
                    }}
                  >
                    {(unidade === "g" ? ["g", "kg"] : unidade === "ml" ? ["ml", "L"] : unidade === "un" ? ["un", "dúzia"] : unidade ? [unidade] : []).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                  <Input
                    inputMode="decimal"
                    aria-label={`Quantidade física de ${item.nome}`}
                    placeholder={unidade ? "Quantidade contada" : "Corrigir unidade"}
                    disabled={!unidade || busy}
                    value={inventarioFisico[item.insumo_id] ?? ""}
                    onChange={(e) => setInventarioFisico((s) => ({ ...s, [item.insumo_id]: e.target.value }))}
                  />
                </div>
              </div>
            );
          })}
          <Button type="submit" variant="outline" className="h-11 w-full" disabled={busy || !estoque.some((item) => item.unidade_base && Boolean(inventarioFisico[item.insumo_id]?.trim()))}>
            {busy ? "Registrando..." : "Registrar contagem física"}
          </Button>
        </form>
      </section>
      </>}

      {secao === "compras" && <>

      <section className="mb-6 rounded-xl border p-4">
        <div className="mb-2 flex items-center gap-2"><FileUp className="size-5" /><h2 className="text-lg font-semibold">Importar compra por documento</h2></div>
        <p className="mb-3 text-sm text-muted-foreground">Envie XML, PDF ou foto do cupom/recibo fiscal. A leitura de PDF e fotos é feita localmente no navegador, sem enviar seu documento para uma IA paga ou consumir créditos do Lovable. A compra só é registrada quando você salvar o formulário após a conferência.</p>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm font-medium hover:bg-muted/50">
          <FileText className="size-4" />{processandoDocumento ? "Lendo documento..." : arquivoDocumento || "Selecionar XML, PDF ou foto"}
          <input aria-label="Documento da compra" type="file" accept={DOCUMENT_ACCEPT} className="sr-only" disabled={processandoDocumento || busy || confirmandoDocumento || !!documentoCompra} onChange={async (event) => {
            const arquivo = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!arquivo) return;
            setErroDocumento(""); setDocumentoCompra(null); setProcessandoDocumento(true); setArquivoDocumento(arquivo.name); setAcknowledgedReview(false);
            try {
              const mime = validateDocumentFile(arquivo);
              if (mime === "application/xml") {
                setDocumentoCompra(parseInvoiceXml(await arquivo.text(), insumos));
              } else {
                setDocumentoCompra(await readPurchaseDocumentLocally(arquivo, insumos));
              }
              toast.success("Documento lido. Confira e corrija os campos antes de continuar.");
            } catch (erro) {
              setErroDocumento(erro instanceof Error ? erro.message : "Não foi possível ler este documento.");
              setArquivoDocumento("");
            } finally { setProcessandoDocumento(false); }
          }} />
        </label>
        {erroDocumento && <p role="alert" className="mt-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">{erroDocumento}</p>}
        {documentoCompra && documentReview && <>
          <PurchaseDocumentReview document={documentoCompra} ingredients={insumos} disabled={confirmandoDocumento || busy} change={setDocumentoCompra} />
          {possibleExistingPurchase && <p role="alert" className="mt-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">Atenção: já existe uma compra com fornecedor, data e valor semelhantes ({brl(Number(possibleExistingPurchase.total) || 0)}). Confira o histórico antes de continuar para evitar duplicidade.</p>}
          {(documentReview.divergence || documentReview.itemDivergences.length > 0 || documentoCompra.duvidas.length > 0 || documentoCompra.linhas.some((l) => l.duvidas.length > 0)) && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledgedReview} onChange={(e) => setAcknowledgedReview(e.target.checked)} className="mt-1" /><span>Conferi manualmente os campos duvidosos e as diferenças entre os totais. Quero continuar sem rateios automáticos.</span></label>}
          <Button type="button" className="mt-3 w-full" disabled={busy || confirmandoDocumento || documentReview.errors.length > 0 || ((documentReview.divergence || documentReview.itemDivergences.length > 0 || documentoCompra.duvidas.length > 0 || documentoCompra.linhas.some((l) => l.duvidas.length > 0) || !!possibleExistingPurchase) && !acknowledgedReview)} onClick={async () => {
            if (!documentoCompra) return;
            const revisao = reviewDocument(documentoCompra, insumos);
            if (revisao.errors.length) { toast.error(revisao.errors[0] ?? "Revise os itens antes de continuar."); return; }
            if (possibleDuplicate(documentoCompra, compras) && !acknowledgedReview) { toast.error("Confira a possível compra duplicada e confirme a revisão."); return; }
            setConfirmandoDocumento(true);
            try {
              const idsNovos: Record<string, string> = {};
              for (const item of documentoCompra.linhas.filter((linha) => !linha.ignorar && linha.insumoId === "__novo__")) {
                const { data: criado, error } = await supabase.from("insumos").insert({
                  nome: item.nome.slice(0, 120), tipo: "ingrediente", preco_embalagem: item.total,
                  quantidade_embalagem: item.quantidade, unidade_embalagem: item.unidade, unidade: item.unidade,
                }).select("id").single();
                if (error) throw error;
                idsNovos[item.id] = criado.id;
              }
              const novasLinhas: Linha[] = documentoCompra.linhas.filter((item) => !item.ignorar).map((item) => {
                const insumoId = item.insumoId === "__novo__" ? idsNovos[item.id] : item.insumoId;
                if (!insumoId) throw new Error("Não foi possível vincular todos os itens aos insumos.");
                if (item.quantidade === null || item.total === null) throw new Error(`Revise quantidade e valor do item "${item.nome}".`);
                return { insumo_id: insumoId, quantidade: String(item.quantidade), unidade: item.unidade, preco: String(Math.round(item.total * 100)) };
              });
              await qc.invalidateQueries({ queryKey: ["insumos"] });
              await qc.refetchQueries({ queryKey: ["insumos"] });
              setData(documentoCompra.data);
              if (documentoCompra.fornecedor) setLocalCompra(documentoCompra.fornecedor.slice(0, 120));
              setLinhas(novasLinhas);
              setDocumentoCompra(null); setArquivoDocumento(""); setErroDocumento(""); setAcknowledgedReview(false);
              toast.success("Itens preparados no formulário. Confira forma de pagamento e total e clique em Salvar compra.");
              formularioCompraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (erro) {
              toast.error(erro instanceof Error ? erro.message : "Não foi possível confirmar os insumos.");
            } finally { setConfirmandoDocumento(false); }
          }}><CheckCircle2 className="size-4" />{confirmandoDocumento ? "Confirmando insumos..." : "Confirmar insumos e preencher compra"}</Button>
          <Button type="button" variant="outline" className="mt-2 w-full" disabled={confirmandoDocumento} onClick={() => { setDocumentoCompra(null); setArquivoDocumento(""); setErroDocumento(""); setAcknowledgedReview(false); }}>Descartar importação</Button>
        </>}
      </section>

      <form ref={formularioCompraRef} onSubmit={salvar} className="mb-8 scroll-mt-4 space-y-4">
        <h2 className="text-lg font-semibold">{editandoCompraId ? "Editar compra" : "Registrar compra"}</h2>
        <Field label="Data da compra">
          <Input required type="date" className="h-11" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Local da compra (opcional)">
          <Input
            type="text"
            list="locais-compra-anteriores"
            autoComplete="organization"
            maxLength={120}
            placeholder="Digite ou selecione um local já usado"
            className="h-11"
            value={localCompra}
            onChange={(e) => setLocalCompra(e.target.value)}
          />
          <datalist id="locais-compra-anteriores">
            {[...new Set(compras
              .map((compra) => compra.local_compra?.trim())
              .filter((local): local is string => Boolean(local))
              .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })))]
              .map((local) => <option key={local.toLocaleLowerCase("pt-BR")} value={local} />)}
          </datalist>
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
                  {insumos.filter((i) => i.ativo !== false || i.id === l.insumo_id).map((i) => <option key={i.id} value={i.id}>{i.nome}{i.ativo === false ? " (inativo — histórico)" : ""}</option>)}
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
      </>}

      {secao === "gastos" && <>
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
          <Empty>{buscaHistorico ? "Nenhuma compra corresponde à busca." : "Nenhuma compra registrada."}</Empty>
        ) : (
          <div className="divide-y">
            {comprasHistoricoFiltradas.map((c) => {
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
                            // A edição precisa mudar para a seção que contém o formulário;
                            // caso contrário, o estado muda mas o formulário continua oculto.
                            setSecao("compras");
                          }}>Editar</Button>
                          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void cancelarCompra(c)}>Cancelar</Button>
                        </>
                      )}
                      <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => setCompraParaExcluir(c)}>
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
      </>}

      <AlertDialog open={!!compraParaExcluir} onOpenChange={(open) => { if (!open && !busy) setCompraParaExcluir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir compra permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              A compra será removida do histórico. Se ela movimentou o estoque, o saldo será estornado. Contas a pagar não canceladas impedem a exclusão; contas canceladas serão preservadas no histórico financeiro e desvinculadas com segurança.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !compraParaExcluir}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                const compra = compraParaExcluir;
                if (!compra || busy) return;
                setCompraParaExcluir(null);
                void excluirCompra(compra);
              }}
            >
              {busy ? "Excluindo..." : "Sim, excluir compra"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
