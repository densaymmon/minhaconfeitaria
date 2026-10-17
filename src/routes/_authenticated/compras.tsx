import * as appQueries from "@/lib/queries";
import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/compras")({
  validateSearch: (search: Record<string, unknown>) => ({
    secao: search["secao"] === "integracao" || search["secao"] === "estoque" ? search["secao"] : "compras",
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
  component: Compras,
});

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


type LinhaDocumentoCompra = { id: string; nome: string; codigo: string; quantidade: number; unidade: string; total: number; insumoId: string };
type DocumentoCompra = { fornecedor: string; data: string; chave: string; total: number; linhas: LinhaDocumentoCompra[] };
function textoXml(elemento: Element | Document, nome: string): string {
  return Array.from(elemento.getElementsByTagName("*")).find((item) => item.localName === nome)?.textContent?.trim() ?? "";
}
function decimalXml(valor: string): number { const numero = Number(valor.replace(",", ".")); return Number.isFinite(numero) ? numero : 0; }
function unidadeDocumento(valor: string): string {
  const u = valor.trim().toLocaleLowerCase("pt-BR");
  if (["kg", "quilo", "quilos"].includes(u)) return "kg";
  if (["g", "gr", "grama", "gramas"].includes(u)) return "g";
  if (["l", "lt", "litro", "litros"].includes(u)) return "L";
  if (["ml", "mililitro", "mililitros"].includes(u)) return "ml";
  if (["un", "und", "unid", "unidade", "unidades", "pc", "peça", "peca"].includes(u)) return "un";
  return "";
}
function dataDocumento(valor: string): string {
  const data = valor.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : hojeISO();
}
function interpretarXmlNfe(xml: string, insumosAtuais: { id: string; nome: string; unidade?: string | null; unidade_embalagem?: string | null }[]): DocumentoCompra {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("O XML não é válido. Confira se selecionou o XML da nota fiscal.");
  const raiz = doc.documentElement;
  const detalhes = Array.from(raiz.getElementsByTagName("*")).filter((el) => el.localName === "det");
  if (!detalhes.length) throw new Error("Não encontrei produtos nesse XML. Envie o XML completo da NF-e ou NFC-e.");
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  const linhas = detalhes.map((detalhe, i) => {
    const produto = Array.from(detalhe.getElementsByTagName("*")).find((el) => el.localName === "prod");
    if (!produto) return null;
    const nome = textoXml(produto, "xProd");
    const quantidade = decimalXml(textoXml(produto, "qCom"));
    const unidade = unidadeDocumento(textoXml(produto, "uCom"));
    const total = decimalXml(textoXml(produto, "vProd")) || quantidade * decimalXml(textoXml(produto, "vUnCom"));
    if (!nome || quantidade <= 0 || total < 0) return null;
    const existente = unidade ? insumosAtuais.find((item) => normalizar(item.nome) === normalizar(nome) && medidasCompativeis(item.unidade_embalagem ?? item.unidade ?? "un").includes(unidade)) : undefined;
    return { id: `linha-${i}-${textoXml(produto, "cProd")}`, nome, codigo: textoXml(produto, "cProd"), quantidade, unidade, total, insumoId: existente?.id ?? "" };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!linhas.length) throw new Error("A nota não contém itens com quantidade e valor reconhecíveis.");
  const emissao = textoXml(raiz, "dhEmi") || textoXml(raiz, "dEmi");
  const inf = Array.from(raiz.getElementsByTagName("*")).find((el) => el.localName === "infNFe");
  return { fornecedor: textoXml(raiz, "xNome"), data: dataDocumento(emissao), chave: (inf?.getAttribute("Id") ?? "").replace(/^NFe/, ""), total: decimalXml(textoXml(raiz, "vNF")), linhas };
}

function Compras() {
  const { secao } = Route.useSearch();
  const { data: insumos } = useSuspenseQuery(appQueries.insumosQ);
  const { data: compras } = useSuspenseQuery(appQueries.comprasQ);
  const { data: itens } = useSuspenseQuery(appQueries.compraItensQ);
  const { data: contasPagar } = useSuspenseQuery(appQueries.contasPagarQ);
  const { data: estoque = [], isLoading: carregandoEstoque, error: erroEstoque } = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("saldo_estoque");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
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
  const eventoInventarioRef = useRef<{ assinatura: string; id: string } | null>(null);
  const eventoCancelarRef = useRef<{ compraId: string; id: string } | null>(null);
  const eventoExcluirRef = useRef<{ compraId: string; id: string } | null>(null);
  const [editandoCompraId, setEditandoCompraId] = useState<string | null>(null);
  const formularioCompraRef = useRef<HTMLFormElement | null>(null);

  // Ao iniciar uma edição, leve o formulário para o início da área de registro.
  useEffect(() => {
    if (editandoCompraId) {
      formularioCompraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editandoCompraId]);
  const [documentoCompra, setDocumentoCompra] = useState<DocumentoCompra | null>(null);
  const [arquivoDocumento, setArquivoDocumento] = useState("");
  const [erroDocumento, setErroDocumento] = useState("");
  const [processandoDocumento, setProcessandoDocumento] = useState(false);
  const [confirmandoDocumento, setConfirmandoDocumento] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

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
  const comprasPeriodo = compras.filter((c) => noPeriodo(c.data_compra));
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
    if (!confirm("Excluir permanentemente esta compra? Ela sairá do histórico. Se movimentou o estoque, o saldo será estornado. Contas a pagar não canceladas impedem a exclusão; contas canceladas serão preservadas no histórico financeiro e desvinculadas pela operação segura do banco.")) return;
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
    const itensInventario = preenchidos.map((item) => ({
      insumo_id: item.insumo_id,
      quantidade_fisica: numeroIngrediente(inventarioFisico[item.insumo_id] ?? ""),
      unidade_base: item.unidade_base!,
    }));
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
      const { error } = await supabase.rpc("registrar_inventario_fisico", {
        itens: itensInventario,
        evento_id: eventoInventarioRef.current.id,
      });
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
    setBusy(true);
    try {
      // Se já houve pagamento de alguma parcela, bloqueie a edição antes de alterar
      // os itens da compra, para não deixar o histórico financeiro inconsistente.
      if (editandoCompraId) {
        const { data: contasGeradas, error: erroContas } = await supabase
          .from("contas_pagar")
          .select("id")
          .eq("compra_id", editandoCompraId)
          .eq("gerada_automaticamente", true);
        if (erroContas) throw erroContas;
        const idsContas = (contasGeradas ?? []).map((conta) => conta.id);
        if (idsContas.length) {
          const { data: pagamentosExistentes, error: erroPagamentos } = await supabase
            .from("contas_pagar_pagamentos")
            .select("id")
            .in("conta_id", idsContas);
          if (erroPagamentos) throw erroPagamentos;
          if ((pagamentosExistentes ?? []).length) {
            throw new Error("Esta compra já possui parcela com pagamento registrado. Para proteger o extrato financeiro, não é possível editar a compra; registre os ajustes necessários separadamente.");
          }
        }
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
      if (!compraSalvaId) throw new Error("A compra foi processada sem retornar seu identificador.");
      const { error: erroLocal } = await supabase.rpc("registrar_local_compra", {
        registro_id: compraSalvaId,
        local_compra: localCompra.trim() || null,
      });
      if (erroLocal) throw erroLocal;
      const { error: erroFinanceiro } = await supabase.rpc("registrar_pagamento_compra", {
        p_compra_id: compraSalvaId,
        p_forma_pagamento: formaPagamentoCompra,
        p_numero_parcelas: formaPagamentoCompra === "credito" ? Number(numeroParcelasCompra) : 1,
        p_primeiro_vencimento: formaPagamentoCompra === "credito" ? primeiroVencimentoCompra : data,
      });
      if (erroFinanceiro) throw erroFinanceiro;
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
      <PageHeader title={secao === "integracao" ? "Conferência de integração" : secao === "estoque" ? "Controle de estoque" : "Compras de insumos"} back="/mais" />

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
          <p role="alert" className="rounded-lg border p-3 text-sm text-destructive">Não foi possível carregar o estoque: {erroEstoque instanceof Error ? erroEstoque.message : "tente novamente."}</p>
        ) : estoque.length === 0 ? (
          <Empty>Nenhum insumo cadastrado.</Empty>
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
          Conte o que existe agora e informe a quantidade na unidade indicada. O sistema ajustará apenas a diferença. Compras antigas não serão importadas automaticamente; insumos sem unidade compatível precisam ser corrigidos no cadastro antes da contagem.
        </p>
        <form onSubmit={salvarInventario} className="space-y-3">
          {estoque.map((item) => {
            const saldo = Number(item.saldo);
            const unidade = item.unidade_base;
            return (
              <div key={item.insumo_id} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 border-b pb-3 last:border-b-0">
                <div className="min-w-0">
                  <p className="font-medium">{item.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Saldo calculado: {saldo.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {unidade ?? ""}
                  </p>
                </div>
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">Físico ({unidade ?? "indefinido"})</span>
                  <Input
                    inputMode="decimal"
                    aria-label={`Quantidade física de ${item.nome}`}
                    placeholder={unidade ? "Ex.: 250" : "Corrigir unidade"}
                    disabled={!unidade || busy}
                    value={inventarioFisico[item.insumo_id] ?? ""}
                    onChange={(e) => setInventarioFisico((s) => ({ ...s, [item.insumo_id]: e.target.value }))}
                  />
                </label>
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
        <p className="mb-3 text-sm text-muted-foreground">Envie o XML original da NF-e/NFC-e para preencher a compra. Os itens serão revisados antes de serem colocados no formulário; nada será salvo no estoque ou financeiro nesta etapa.</p>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm font-medium hover:bg-muted/50">
          <FileText className="size-4" />{processandoDocumento ? "Lendo XML..." : arquivoDocumento || "Selecionar arquivo XML da nota"}
          <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" disabled={processandoDocumento || busy} onChange={async (event) => {
            const arquivo = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!arquivo) return;
            setErroDocumento(""); setDocumentoCompra(null); setProcessandoDocumento(true); setArquivoDocumento(arquivo.name);
            try { if (arquivo.size > 10 * 1024 * 1024) throw new Error("O XML deve ter no máximo 10 MB.");
              setDocumentoCompra(interpretarXmlNfe(await arquivo.text(), insumos));
              toast.success("Nota lida. Revise os itens e confirme antes de usar na compra.");
            } catch (erro) { setErroDocumento(erro instanceof Error ? erro.message : "Não foi possível ler este XML."); setArquivoDocumento(""); }
            finally { setProcessandoDocumento(false); }
          }} />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">PDF e fotos exigem integração segura de OCR/IA, ainda não configurada. Esta versão não vai afirmar que esses formatos foram importados automaticamente.</p>
        {erroDocumento && <p role="alert" className="mt-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">{erroDocumento}</p>}
        {documentoCompra && <>
          <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
            <p className="font-medium">{documentoCompra.fornecedor || "Fornecedor não identificado no XML"}</p>
            <p className="text-muted-foreground">Emissão: {dataBR(documentoCompra.data)} · {documentoCompra.linhas.length} item(ns)</p>
            {documentoCompra.chave && <p className="mt-1 break-all text-xs text-muted-foreground">Chave NF-e: {documentoCompra.chave}</p>}
            <p className="mt-1 font-semibold">Total informado na nota: {brl(documentoCompra.total || documentoCompra.linhas.reduce((s, item) => s + item.total, 0))}</p>
          </div>
          <div className="mt-3 space-y-3">{documentoCompra.linhas.map((linha) => <div key={linha.id} className="rounded-lg border p-3">
            <p className="font-medium">{linha.nome}</p><p className="mb-2 text-xs text-muted-foreground">{linha.quantidade.toLocaleString("pt-BR")} {linha.unidade || "unidade não reconhecida"} · {brl(linha.total)}</p>
            <Field label="Vincular ao cadastro"><select value={linha.insumoId} onChange={(event) => setDocumentoCompra((atual) => atual ? ({ ...atual, linhas: atual.linhas.map((item) => item.id === linha.id ? { ...item, insumoId: event.target.value } : item) }) : atual)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecione um insumo existente</option>{insumos.map((insumo) => <option key={insumo.id} value={insumo.id}>{insumo.nome}</option>)}
              <option value="__novo__" disabled={!linha.unidade}>Cadastrar novo insumo após confirmação{!linha.unidade ? " (unidade precisa ser revisada)" : ""}</option>
            </select></Field>
            {!linha.unidade && <p className="mt-2 text-xs text-amber-700">A unidade não foi reconhecida. Escolha um insumo existente com unidade compatível.</p>}
          </div>)}</div>
          {Math.abs(documentoCompra.total - documentoCompra.linhas.reduce((s, item) => s + item.total, 0)) > 0.02 && <p className="mt-3 rounded-md border border-amber-500/40 p-3 text-sm">A soma dos itens ({brl(documentoCompra.linhas.reduce((s, item) => s + item.total, 0))}) difere do total da nota ({brl(documentoCompra.total)}). Confira descontos, frete e outros valores antes de confirmar.</p>}
          <Button type="button" className="mt-3 w-full" disabled={busy || confirmandoDocumento || documentoCompra.linhas.some((item) => !item.insumoId)} onClick={async () => {
            if (!documentoCompra) return; setConfirmandoDocumento(true);
            try {
              const idsNovos: Record<string, string> = {};
              for (const item of documentoCompra.linhas.filter((linha) => linha.insumoId === "__novo__")) {
                const existente = insumos.find((insumo) => insumo.nome.trim().toLocaleLowerCase("pt-BR") === item.nome.trim().toLocaleLowerCase("pt-BR"));
                if (existente) { idsNovos[item.id] = existente.id; continue; }
                if (!item.unidade) throw new Error(`Revise a unidade do item "${item.nome}" antes de cadastrá-lo.`);
                const { data: criado, error } = await supabase.from("insumos").insert({ nome: item.nome.slice(0, 120), tipo: "ingrediente", preco_embalagem: item.total, quantidade_embalagem: item.quantidade, unidade_embalagem: item.unidade, unidade: item.unidade }).select("id").single();
                if (error) throw error; idsNovos[item.id] = criado.id;
              }
              const novasLinhas: Linha[] = documentoCompra.linhas.map((item) => {
                const insumoId = item.insumoId === "__novo__" ? idsNovos[item.id] : item.insumoId;
                if (!insumoId) throw new Error("Não foi possível vincular todos os itens aos insumos.");
                return { insumo_id: insumoId, quantidade: String(item.quantidade), unidade: item.unidade, preco: String(Math.round(item.total * 100)) };
              });
              await qc.invalidateQueries({ queryKey: ["insumos"] }); await qc.refetchQueries({ queryKey: ["insumos"] });
              setData(documentoCompra.data); if (documentoCompra.fornecedor) setLocalCompra(documentoCompra.fornecedor.slice(0, 120)); setLinhas(novasLinhas);
              setDocumentoCompra(null); setArquivoDocumento(""); toast.success("Itens carregados no formulário. Confira os dados e a forma de pagamento antes de salvar.");
              formularioCompraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (erro) { toast.error(erro instanceof Error ? erro.message : "Não foi possível confirmar os itens da nota."); }
            finally { setConfirmandoDocumento(false); }
          }}><CheckCircle2 className="size-4" />{confirmandoDocumento ? "Confirmando insumos..." : "Confirmar insumos e preencher compra"}</Button>
          <Button type="button" variant="outline" className="mt-2 w-full" disabled={confirmandoDocumento} onClick={() => { setDocumentoCompra(null); setArquivoDocumento(""); setErroDocumento(""); }}>Descartar importação</Button>
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
            autoComplete="organization"
            maxLength={120}
            placeholder="Ex.: Atacadão, Assaí, loja ou fornecedor"
            className="h-11"
            value={localCompra}
            onChange={(e) => setLocalCompra(e.target.value)}
          />
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
                  {insumos.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
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
          <Empty>Nenhuma compra registrada.</Empty>
        ) : (
          <div className="divide-y">
            {comprasPeriodo.map((c) => {
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
                          }}>Editar</Button>
                          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void cancelarCompra(c)}>Cancelar</Button>
                        </>
                      )}
                      <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void excluirCompra(c)}>
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
    </>
  );
}
