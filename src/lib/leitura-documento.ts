// Leitura local (sem IA) de PDFs e fotos de documentos de compra: DANFE (NF-e), NFC-e no layout
// da consulta da SEFAZ, cupom NFC-e compacto e recibos simples. Funções puras, testadas em
// leitura-documento.test.ts. O resultado é sempre uma sugestão: a pessoa confere antes de salvar.
import type { InvoiceExtraction } from "./purchase-document";

/** Pedaço de texto de uma página de PDF, com a posição horizontal (para achar as colunas). */
export type Parte = { texto: string; x: number; largura: number };
/** Linha de uma página de PDF: as partes que estão na mesma altura. */
export type LinhaPdf = { y: number; partes: Parte[] };
type Item = InvoiceExtraction["itens"][number];

const MOEDA = String.raw`\d{1,7}(?:\.\d{3})*,\d{2}`;
const MOEDA_OU_MAIS = String.raw`\d{1,7}(?:\.\d{3})*,\d{2,4}`;

/** Número no formato brasileiro ("1.234,56", "4,0000", "0,512") ou simples ("2", "2.25"). */
export function numeroBr(valor: string | undefined | null): number | null {
  const s = (valor ?? "").trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!s || !/^\d[\d.,]*$/.test(s)) return null;
  const normalizado = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const quase = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.001);
const arred = (n: number, casas = 6) => Math.round(n * 10 ** casas) / 10 ** casas;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

// ---------------------------------------------------------------------------------------------
// Páginas de PDF em linhas

/** Agrupa os fragmentos de texto de uma página de PDF em linhas, pela altura de cada um. */
export function linhasDaPagina(items: Array<{ str?: string; transform?: number[]; width?: number }>): LinhaPdf[] {
  const partes = items
    .map((item) => ({ texto: (item.str ?? "").trim(), x: item.transform?.[4] ?? 0, y: item.transform?.[5] ?? 0, largura: item.width ?? 0 }))
    .filter((p) => p.texto);
  partes.sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: LinhaPdf[] = [];
  for (const p of partes) {
    let linha = linhas.find((l) => Math.abs(l.y - p.y) <= 2.5);
    if (!linha) { linha = { y: p.y, partes: [] }; linhas.push(linha); }
    linha.partes.push({ texto: p.texto, x: p.x, largura: p.largura });
  }
  linhas.sort((a, b) => b.y - a.y);
  for (const l of linhas) l.partes.sort((a, b) => a.x - b.x);
  return linhas;
}

export const textoDaLinha = (l: LinhaPdf) => l.partes.map((p) => p.texto).join(" ");

// ---------------------------------------------------------------------------------------------
// Cabeçalho: chave, número, data, fornecedor e totais

function dvChaveValido(chave: string) {
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(chave[43]);
}

/** Chave de acesso de 44 dígitos (com ou sem espaços), só se o dígito verificador conferir. */
export function chaveDeAcesso(texto: string): string | null {
  for (const m of texto.matchAll(/(?<!\d)(\d{4}(?:[ .]?\d{4}){10})(?!\d)/g)) {
    const digitos = (m[1] ?? "").replace(/\D/g, "");
    if (digitos.length === 44 && dvChaveValido(digitos)) return digitos;
  }
  return null;
}

function dataValida(dia: string, mes: string, ano: string) {
  const iso = `${ano}-${mes}-${dia}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

function primeiraData(texto: string): string | null {
  for (const m of texto.matchAll(/\b(\d{2})[/. -](\d{2})[/. -](20\d{2})\b/g)) {
    const iso = dataValida(m[1] ?? "", m[2] ?? "", m[3] ?? "");
    if (iso) return iso;
  }
  const iso = texto.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return iso ? dataValida(iso[3] ?? "", iso[2] ?? "", iso[1] ?? "") : null;
}

/**
 * Valor escrito logo depois do rótulo na mesma linha ou, nas caixas da DANFE (rótulo em cima,
 * valor embaixo), o valor na mesma coluna em uma das linhas seguintes.
 */
function valorDoRotulo(rotulo: RegExp, texto: string[], linhas: LinhaPdf[] | undefined, formato: RegExp): string | null {
  const noMeio = new RegExp("(?:" + rotulo.source + String.raw`)[^\d\n]{0,25}?(` + formato.source + ")", "i");
  for (const linha of texto) {
    const m = linha.match(noMeio);
    if (m?.[1]) return m[1];
  }
  if (!linhas) return null;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha) continue;
    const parte = linha.partes.find((p) => rotulo.test(p.texto));
    if (!parte) continue;
    for (const abaixo of linhas.slice(i + 1, i + 4)) {
      const valor = abaixo.partes.find((p) => Math.abs(p.x - parte.x) <= 15 && new RegExp(`^${formato.source}$`, "i").test(p.texto));
      if (valor) return valor.texto;
    }
  }
  return null;
}

const RUIDO_FORNECEDOR = /\b(DANFE|NFC-?E|NF-?E|DOCUMENTO AUXILIAR.*|CUPOM FISCAL.*|EXTRATO.*)\b/gi;
const TEM_RUIDO = /\b(DANFE|NFC-?E|NF-?E|DOCUMENTO AUXILIAR|CUPOM FISCAL|EXTRATO)\b/i;
const EMPRESA = /\b(LTDA|EIRELI|ME|EPP|S\/?A|SA|MEI|COM[EÉ]RCIO|MERCADO|SUPERMERCADOS?|ATACAD\w*|ATACAREJO|DISTRIBUIDORA|EMP[OÓ]RIO|PADARIA|ARMAZ[EÉ]M|HORTIFRUTI|A[CÇ]OUGUE)\b/i;
const NAO_E_NOME = /\b(CNPJ|CPF|INSCRI[CÇ][AÃ]O|ENDERE[CÇ]O|RUA|AV\.?|AVENIDA|CEP|FONE|TEL|PROTOCOLO|CHAVE|CONSULTA|DESTINAT[AÁ]RIO|NATUREZA|RECEBEMOS)\b/i;

function fornecedorDoTexto(texto: string[]): string | null {
  const limpar = (s: string) => s.replace(RUIDO_FORNECEDOR, "").replace(/\s{2,}/g, " ").replace(/[-–|:]+\s*$/, "").trim().slice(0, 120) || null;
  const recebemos = texto.join(" ").match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
  if (recebemos?.[1]) return limpar(recebemos[1]);
  const inicio = texto.slice(0, 15);
  const empresa = inicio.find((l) => EMPRESA.test(l) && !NAO_E_NOME.test(l) && l.length <= 100);
  if (empresa) return limpar(empresa);
  const antesDoCnpj = inicio.findIndex((l) => /^\s*CNPJ\b/i.test(l));
  if (antesDoCnpj > 0) {
    const candidato = inicio[antesDoCnpj - 1];
    if (candidato && !NAO_E_NOME.test(candidato)) return limpar(candidato);
  }
  const plausivel = inicio.find((l) => l.length >= 3 && l.length <= 100 && !NAO_E_NOME.test(l) && !/\d{2}[/.]\d{2}[/.]\d{4}/.test(l) && /[A-Za-zÀ-ú]{3}/.test(l) && !TEM_RUIDO.test(l));
  return plausivel ? limpar(plausivel) : null;
}

type Cabecalho = Pick<InvoiceExtraction, "fornecedor" | "data" | "documento" | "chave" | "total" | "desconto" | "despesas">;

export function lerCabecalho(texto: string[], linhas?: LinhaPdf[]): Cabecalho {
  const tudo = texto.join("\n");
  const chave = chaveDeAcesso(tudo);
  const numeroDaChave = chave ? String(Number(chave.slice(25, 34))) : null;
  const numeroEscrito = tudo.match(/\b(?:N[º°o]\.?|N[UÚ]MERO:?)\s*([\d.]{1,11})\b/i)?.[1]?.replace(/\D/g, "");
  const data = (() => {
    const rotulada = valorDoRotulo(/DATA\s+(?:DA|DE)\s+EMISS[AÃ]O|EMISS[AÃ]O:?/i, texto, linhas, /\d{2}[/.-]\d{2}[/.-]20\d{2}/);
    const m = rotulada?.match(/(\d{2})[/.-](\d{2})[/.-](20\d{2})/);
    return (m ? dataValida(m[1] ?? "", m[2] ?? "", m[3] ?? "") : null) ?? primeiraData(tudo);
  })();
  const moeda = new RegExp(MOEDA);
  const valor = (rotulo: RegExp) => numeroBr(valorDoRotulo(rotulo, texto, linhas, moeda));
  // Em ordem de preferência: o valor efetivamente pago vem antes do total bruto dos itens.
  const total = [/VALOR\s+TOTAL\s+DA\s+NOTA/i, /VALOR\s+A\s+PAGAR(?:\s+R\$)?/i, /TOTAL\s+A\s+PAGAR/i, /TOTAL\s+GERAL/i, /VALOR\s+TOTAL(?:\s+R\$)?/i, /TOTAL\s+R\$/i]
    .reduce<number | null>((achado, rotulo) => achado ?? valor(rotulo), null);
  const desconto = valor(/(?:^|\s)DESCONTOS?(?:\s+R\$)?(?=[\s:]|$)|VLR\.?\s*DESC\.?\s+R\$/i);
  const frete = valor(/VALOR\s+DO\s+FRETE|(?:^|\s)FRETE(?:\s+R\$)?(?=[\s:]|$)/i);
  const seguro = valor(/VALOR\s+DO\s+SEGURO/i);
  const outras = valor(/OUTRAS\s+DESPESAS(?:\s+ACESS[OÓ]RIAS)?/i);
  const despesas = [frete, seguro, outras].some((v) => v !== null) ? arred((frete ?? 0) + (seguro ?? 0) + (outras ?? 0), 2) : null;
  return {
    fornecedor: fornecedorDoTexto(texto),
    data,
    documento: numeroDaChave ?? (numeroEscrito ? String(Number(numeroEscrito)) : null),
    chave,
    total,
    desconto,
    despesas,
  };
}

// ---------------------------------------------------------------------------------------------
// Unidades e tamanho da embalagem

const UNIDADES_DE_CONTAGEM = new Set(["UN", "UND", "UNID", "PC", "PÇ", "PCT", "PT", "CX", "FD", "BD", "SC", "DZ", "BJ", "LATA", "GF", "POTE", "VD"]);

/** Unidade escrita no documento ("UN001UN", "LT", "KG"...) para a unidade do sistema. */
export function unidadeDoDocumento(bruta: string | null | undefined): { unidade: string | null; contagem: boolean; duzia: boolean } {
  const sigla = (bruta ?? "").toUpperCase().match(/^[A-ZÇ]+/)?.[0] ?? "";
  if (sigla === "KG") return { unidade: "kg", contagem: false, duzia: false };
  if (sigla === "G" || sigla === "GR" || sigla === "GRS") return { unidade: "g", contagem: false, duzia: false };
  if (sigla === "L" || sigla === "LT" || sigla === "LTS") return { unidade: "L", contagem: false, duzia: false };
  if (sigla === "ML") return { unidade: "ml", contagem: false, duzia: false };
  if (UNIDADES_DE_CONTAGEM.has(sigla)) return { unidade: "un", contagem: true, duzia: sigla === "DZ" };
  return { unidade: null, contagem: false, duzia: false };
}

const MEDIDA = { KG: "kg", G: "g", GR: "g", GRS: "g", L: "L", LT: "L", ML: "ml" } as Record<string, string>;

/** Conteúdo de uma embalagem lido da descrição: "395G", "1,01KG", "CX 12X1L", "COM 30 UNIDADES". */
export function conteudoDaEmbalagem(descricao: string): { quantidade: number; unidade: string } | null {
  const d = descricao.toUpperCase();
  const multiplo = [...d.matchAll(/(?<![\d,.])(\d{1,3})\s?X\s?(\d+(?:[.,]\d+)?)\s?(KG|GRS|GR|G|LT|L|ML)\b/g)].pop();
  if (multiplo) {
    const n = Number(multiplo[1]);
    const cada = numeroBr(multiplo[2]);
    const unidade = MEDIDA[multiplo[3] ?? ""];
    if (n > 0 && cada && unidade) return { quantidade: arred(n * cada), unidade };
  }
  const medida = [...d.matchAll(/(?<![\d,.])(\d+(?:[.,]\d+)?)\s?(KG|GRS|GR|G|LT|L|ML)\b/g)].pop();
  if (medida) {
    const q = numeroBr(medida[1]);
    const unidade = MEDIDA[medida[2] ?? ""];
    if (q && unidade) return { quantidade: q, unidade };
  }
  const contagem = d.match(/(?<![\d,.])(\d{1,4})\s?(?:UN|UND|UNID|UNIDADES|OVOS)\b/);
  const n = numeroBr(contagem?.[1]);
  if (n && n > 1) return { quantidade: n, unidade: "un" };
  return null;
}

/**
 * Monta o item e, quando a unidade é de contagem (UN, CX, PCT...) e a descrição traz o conteúdo
 * da embalagem, converte para a medida real: 24 UN de "LEITE CONDENSADO 395G" = 9.480 g.
 */
export function montarItem(base: { descricao: string; codigo: string | null; quantidade: number | null; unidadeBruta: string | null; unitario: number | null; total: number | null; desconto: number | null }, origem: string): Item {
  const duvidas = [origem];
  const u = unidadeDoDocumento(base.unidadeBruta);
  let quantidade = base.quantidade;
  let unidade = u.unidade;
  let unitario = base.unitario;
  if (u.contagem && quantidade !== null) {
    const conteudo = u.duzia ? { quantidade: 12, unidade: "un" } : conteudoDaEmbalagem(base.descricao);
    if (conteudo) {
      const convertida = arred(quantidade * conteudo.quantidade);
      duvidas.push(`Embalagem convertida: ${fmt(quantidade)} × ${fmt(conteudo.quantidade)} ${conteudo.unidade} = ${fmt(convertida)} ${conteudo.unidade}. Confira.`);
      unitario = unitario !== null ? arred(unitario / conteudo.quantidade, 6) : null;
      quantidade = convertida;
      unidade = conteudo.unidade;
    }
  }
  return {
    descricao: base.descricao.replace(/\s{2,}/g, " ").trim().slice(0, 120),
    codigo: base.codigo,
    quantidade,
    unidade,
    valor_unitario: unitario,
    valor_total: base.total,
    desconto: base.desconto,
    duvidas,
  };
}

/**
 * Entre os números depois do valor unitário, acha o total do item: o que bate com
 * quantidade × unitário (bruto) ou com bruto − desconto (líquido), em qualquer ordem de colunas.
 */
function totalDoItem(quantidade: number, unitario: number, numeros: number[]): { total: number; desconto: number } | null {
  const bruto = quantidade * unitario;
  const candidatos = numeros.slice(0, 4);
  // 1) Total bruto (quantidade × unitário); o desconto, se houver, é o número que vem logo antes ou depois.
  const j = candidatos.findIndex((t) => t > 0 && quase(t, bruto));
  if (j >= 0) return { total: candidatos[j] ?? 0, desconto: 0 };
  // 2) Total líquido (bruto − desconto), com o desconto em outra coluna.
  for (let i = 0; i < candidatos.length; i++) {
    const t = candidatos[i] ?? 0;
    if (t <= 0) continue;
    const d = candidatos.find((x, k) => k !== i && x > 0 && quase(t, bruto - x));
    if (d !== undefined) return { total: t, desconto: d };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Itens

const FIM_DA_TABELA = /DADOS\s+ADICIONAIS|C[AÁ]LCULO\s+DO\s+ISSQN|INFORMA[CÇ][OÕ]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO/i;
type Coluna = "codigo" | "descricao" | "ncm" | "cst" | "cfop" | "un" | "quant" | "unit" | "total" | "desc" | "outra";

function colunaDoCabecalho(texto: string): Coluna {
  const t = texto.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/^C(OD|ODIGO)/.test(t)) return "codigo";
  if (/DESCRI/.test(t)) return "descricao";
  if (/NCM/.test(t)) return "ncm";
  if (/CST|CSOSN|^O\//.test(t)) return "cst";
  if (/CFOP/.test(t)) return "cfop";
  if (/^(UN|UNID|UNIDADE|UND)$/.test(t)) return "un";
  if (/QUANT|QTD|QTDE/.test(t)) return "quant";
  if (/UNIT/.test(t)) return "unit";
  if (/V\.?\s*DESC|DESCONTO/.test(t)) return "desc";
  if (/TOTAL/.test(t) && !/BC|ICMS|IPI/.test(t)) return "total";
  return "outra";
}

/** Tabela "DADOS DO PRODUTO" da DANFE, usando as posições das colunas do cabeçalho. */
export function itensDaTabelaDanfe(linhas: LinhaPdf[]): Item[] {
  const iCab = linhas.findIndex((l) => {
    const cols = new Set(l.partes.map((p) => colunaDoCabecalho(p.texto)));
    return cols.has("descricao") && cols.has("quant") && cols.has("unit") && cols.has("total");
  });
  if (iCab < 0) return [];
  const cabecalho = (linhas[iCab]?.partes ?? []).map((p) => ({ coluna: colunaDoCabecalho(p.texto), inicio: p.x, centro: p.x + p.largura / 2 }));
  const colunaDe = (p: Parte): Coluna => {
    const centro = p.x + p.largura / 2;
    let melhor = cabecalho[0];
    for (const c of cabecalho) if (Math.abs(c.centro - centro) < Math.abs((melhor?.centro ?? 0) - centro)) melhor = c;
    // A descrição é longa: começa na coluna dela mesmo que o centro caia mais à direita.
    const desc = cabecalho.find((c) => c.coluna === "descricao");
    const depoisDaDesc = cabecalho.filter((c) => (desc ? c.inicio > desc.inicio : false)).sort((a, b) => a.inicio - b.inicio)[0];
    if (desc && p.x >= desc.inicio - 3 && (!depoisDaDesc || p.x < depoisDaDesc.inicio - 3)) return "descricao";
    return melhor?.coluna ?? "outra";
  };
  type Bruto = { descricao: string; codigo: string | null; quantidade: number; unidadeBruta: string | null; unitario: number | null; total: number; desconto: number };
  const brutos: Bruto[] = [];
  for (const linha of linhas.slice(iCab + 1)) {
    if (FIM_DA_TABELA.test(textoDaLinha(linha))) break;
    const campos: Partial<Record<Coluna, string>> = {};
    for (const p of linha.partes) {
      const c = colunaDe(p);
      campos[c] = campos[c] ? `${campos[c]} ${p.texto}` : p.texto;
    }
    const quantidade = numeroBr(campos.quant);
    const totalBruto = numeroBr(campos.total);
    if (campos.descricao && quantidade !== null && totalBruto !== null) {
      brutos.push({ descricao: campos.descricao, codigo: campos.codigo ?? null, quantidade, unidadeBruta: campos.un ?? null, unitario: numeroBr(campos.unit), total: totalBruto, desconto: numeroBr(campos.desc) ?? 0 });
    } else if (campos.descricao && !campos.quant && !campos.total && brutos.length) {
      // Descrição que quebrou para a linha de baixo.
      const anterior = brutos[brutos.length - 1];
      if (anterior) anterior.descricao = `${anterior.descricao} ${campos.descricao}`;
    }
  }
  return brutos.map((b) => {
    // Na DANFE o "valor total" do item é o bruto (quantidade × unitário); o desconto vem à parte.
    const liquido = b.unitario !== null && quase(b.total, b.quantidade * b.unitario) ? arred(b.total - b.desconto, 2) : b.total;
    return montarItem({ ...b, total: liquido }, "Item lido da tabela da DANFE; confira o insumo e a unidade.");
  });
}

/** Linhas de produto da DANFE em texto corrido (sem posições, por exemplo depois do OCR). */
export function itensDaDanfeEmTexto(texto: string[]): Item[] {
  const itens: Item[] = [];
  const re = new RegExp(String.raw`^\s*(\d{2,14})\s+(.+?)\s+(\d{8})\s+(\d{3,4})\s+(\d{4})\s+([A-Z][A-Z0-9*]{0,9})\s+(\d+(?:[.,]\d+)?)\s+(${MOEDA_OU_MAIS})\s+(.*)$`, "i");
  for (const linha of texto) {
    const m = linha.match(re);
    if (!m) continue;
    const quantidade = numeroBr(m[7]);
    const unitario = numeroBr(m[8]);
    const resto = [...(m[9] ?? "").matchAll(new RegExp(MOEDA_OU_MAIS, "g"))].map((n) => numeroBr(n[0]) ?? NaN);
    if (quantidade === null || unitario === null) continue;
    const achado = totalDoItem(quantidade, unitario, resto);
    if (!achado) continue;
    const liquido = achado.desconto > 0 && quase(achado.total, quantidade * unitario) ? arred(achado.total - achado.desconto, 2) : achado.total;
    itens.push(montarItem({ descricao: m[2] ?? "", codigo: m[1] ?? null, quantidade, unidadeBruta: m[6] ?? null, unitario, total: liquido, desconto: achado.desconto }, "Item lido da tabela da DANFE; confira o insumo e a unidade."));
  }
  return itens;
}

/** NFC-e no layout da consulta da SEFAZ: "PRODUTO (Código: 123)" e, abaixo, "Qtde.: … Vl. Total …". */
export function itensDaConsultaNfce(texto: string[]): Item[] {
  const itens: Item[] = [];
  const detalhe = new RegExp(String.raw`Qtde\.?:?\s*(\d+(?:[.,]\d+)?)\s*UN:?\s*([A-Za-zÇç]{1,5})\s*Vl\.?\s*Unit\.?:?\s*(${MOEDA_OU_MAIS})\s*Vl\.?\s*Total:?\s*(${MOEDA})`, "i");
  for (let i = 0; i < texto.length; i++) {
    const cab = texto[i]?.match(/^(.+?)\s*\(\s*C[oó]d(?:igo)?\.?:?\s*([^)]*?)\s*\)\s*(.*)$/i);
    if (!cab) continue;
    const janela = [cab[3] ?? "", texto[i + 1] ?? "", texto[i + 2] ?? ""].join(" ");
    const d = janela.match(detalhe);
    if (!d) continue;
    itens.push(montarItem({ descricao: cab[1] ?? "", codigo: cab[2] || null, quantidade: numeroBr(d[1]), unidadeBruta: d[2] ?? null, unitario: numeroBr(d[3]), total: numeroBr(d[4]), desconto: null }, "Item lido da NFC-e; confira o insumo e a unidade."));
  }
  return itens;
}

/** Cupom NFC-e compacto: "001 7891000100103 LEITE INTEGRAL 1L 6 UN 4,89 29,34" (com ou sem "X"). */
export function itensDoCupom(texto: string[]): Item[] {
  const itens: Item[] = [];
  const re = new RegExp(String.raw`^\s*(?:\d{1,3}\s+)?(?:(\d{4,14})\s+)?(.+?)\s+(\d+(?:[.,]\d{1,4})?)\s*(UN|UND|UNID|KG|G|GR|L|LT|ML|CX|PC|PCT|FD|DZ|BD|SC|BJ)\s*(?:X\s*)?(${MOEDA_OU_MAIS})\s+(${MOEDA})\s*$`, "i");
  for (const linha of texto) {
    const m = linha.match(re);
    if (!m || /\b(TOTAL|PAGAR|DESCONTO|TROCO)\b/i.test(m[2] ?? "")) continue;
    itens.push(montarItem({ descricao: m[2] ?? "", codigo: m[1] ?? null, quantidade: numeroBr(m[3]), unidadeBruta: m[4] ?? null, unitario: numeroBr(m[5]), total: numeroBr(m[6]), desconto: null }, "Item lido do cupom; confira o insumo e a unidade."));
  }
  return itens;
}

const NAO_E_ITEM = /\b(CNPJ|CPF|TOTAL|SUBTOTAL|DESCONTOS?|ACR[EÉ]SCIMO|TROCO|DINHEIRO|CR[EÉ]DITO|D[EÉ]BITO|PIX|CART[AÃ]O|FRETE|EMISS[AÃ]O|CONSULTA|CHAVE|PROTOCOLO|OPERADOR|CAIXA|PAGAR|PAGO|PAGAMENTO|TRIBUTOS?|APROX|ITENS|SALDO|PARCELA|VENCIMENTO)\b/i;

/** Recibo simples: "descrição [quantidade unidade] [x unitário] total" em cada linha. */
export function itensGenericos(texto: string[]): Item[] {
  const itens: Item[] = [];
  for (const linha of texto) {
    if (NAO_E_ITEM.test(linha)) continue;
    const valores = [...linha.matchAll(new RegExp(String.raw`(?:R\$\s*)?\b(${MOEDA})\b`, "g"))];
    const ultimo = valores[valores.length - 1];
    const total = numeroBr(ultimo?.[1]);
    if (!ultimo || total === null) continue;
    const prefixo = linha.slice(0, ultimo.index ?? linha.length).trim().replace(/[|*•]+$/g, "").trim();
    const qtd = prefixo.match(new RegExp(String.raw`(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|un|und|unid|unidade|l|lt|ml|pc|pct|cx)?\s*(?:x|×)?\s*(${MOEDA})?\s*$`, "i"));
    let descricao = prefixo;
    let quantidade: number | null = null;
    let unidade: string | null = null;
    let unitario: number | null = null;
    if (qtd?.index !== undefined) {
      descricao = prefixo.slice(0, qtd.index).trim();
      quantidade = numeroBr(qtd[1]);
      unidade = qtd[2] ?? null;
      unitario = numeroBr(qtd[3]);
    } else if (valores.length >= 2) {
      const anterior = valores[valores.length - 2];
      unitario = numeroBr(anterior?.[1]);
      descricao = linha.slice(0, anterior?.index ?? 0).trim();
    }
    descricao = descricao.replace(/^[\d\s.)-]+/, "").replace(/[|*•]+$/g, "").trim();
    if (descricao.length < 2) continue;
    itens.push(montarItem({ descricao, codigo: null, quantidade, unidadeBruta: unidade, unitario, total, desconto: null }, "Item lido por aproximação; confira descrição, quantidade, unidade e valores."));
  }
  return itens;
}

// ---------------------------------------------------------------------------------------------
// Documento inteiro

/** Lê o documento: texto das páginas (PDF ou OCR) e, quando houver, as linhas com posições do PDF. */
export function lerDocumento(textoBruto: string, linhasPdf?: LinhaPdf[]): InvoiceExtraction {
  const texto = textoBruto.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 800);
  const cab = lerCabecalho(texto, linhasPdf);
  const leitores: Array<() => Item[]> = [
    () => (linhasPdf ? itensDaTabelaDanfe(linhasPdf) : []),
    () => itensDaDanfeEmTexto(texto),
    () => itensDaConsultaNfce(texto),
    () => itensDoCupom(texto),
    () => itensGenericos(texto),
  ];
  let itens: Item[] = [];
  for (const ler of leitores) {
    itens = ler();
    if (itens.length) break;
  }
  const duvidas = ["Leitura automática no navegador: confira todos os campos antes de registrar a compra."];
  if (!cab.fornecedor) duvidas.push("Fornecedor não identificado com segurança.");
  if (!cab.data) duvidas.push("Data não identificada; informe a data correta.");
  if (cab.total === null) duvidas.push("Total do documento não identificado; confira o comprovante.");
  if (!itens.length) duvidas.push("Não foi possível separar os itens automaticamente. Cadastre-os manualmente na conferência.");
  const soma = itens.reduce((s, i) => s + (i.valor_total ?? 0), 0);
  if (cab.total !== null && itens.length && !quase(soma, cab.total)) {
    const ajuste = arred((cab.despesas ?? 0) - (itens.some((i) => (i.desconto ?? 0) > 0) ? 0 : (cab.desconto ?? 0)), 2);
    if (ajuste !== 0 && quase(arred(soma + ajuste, 2), cab.total)) {
      duvidas.push(`A diferença entre os itens (${soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) e o total é o ${ajuste > 0 ? "frete/outras despesas" : "desconto geral"} do documento. Ajuste os itens se quiser incluir isso no custo.`);
    }
  }
  return { ...cab, duvidas, itens: itens.slice(0, 100) };
}
