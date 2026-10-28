// Pix "copia e cola" (BR Code estático do Banco Central), gerado a partir da chave Pix
// da confeitaria, sem gateway e sem taxa. Funções puras, testadas em pix.test.ts.
// Referência: Manual de Padrões para Iniciação do Pix (BR Code / EMV-QRCPS-MPM).

export type TipoChavePix = "cpf" | "cnpj" | "telefone" | "email" | "aleatoria";

const so = (s: string) => s.replace(/\D/g, "");

function cpfValido(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    const soma = [...base].reduce((s, d, i) => s + Number(d) * (pesoInicial - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

function cnpjValido(cnpj: string) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((s, d, i) => s + Number(d) * (pesos[i] ?? 0), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

/**
 * Identifica o tipo e o formato oficial da chave. Celular vira +55DDDNUMERO.
 * Onze dígitos sem formatação: CPF se o dígito verificador conferir, senão celular.
 */
export function normalizarChavePix(chave: string, tipoInformado?: TipoChavePix | null): { tipo: TipoChavePix; valor: string } | null {
  const texto = chave.trim();
  if (!texto) return null;
  if (tipoInformado) {
    const d = so(texto);
    if (tipoInformado === "cpf") return d.length === 11 ? { tipo: "cpf", valor: d } : null;
    if (tipoInformado === "cnpj") return d.length === 14 ? { tipo: "cnpj", valor: d } : null;
    if (tipoInformado === "telefone") {
      const f = (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
      return f.length === 10 || f.length === 11 ? { tipo: "telefone", valor: `+55${f}` } : null;
    }
    if (tipoInformado === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto) ? { tipo: "email", valor: texto.toLowerCase() } : null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto) ? { tipo: "aleatoria", valor: texto.toLowerCase() } : null;
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return { tipo: "email", valor: texto.toLowerCase() };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(texto)) return { tipo: "aleatoria", valor: texto.toLowerCase() };
  const digitos = so(texto);
  const pareceTelefone = texto.startsWith("+") || /\(\d{2}\)/.test(texto);
  if (!pareceTelefone && /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(texto) && cpfValido(digitos)) return { tipo: "cpf", valor: digitos };
  if (!pareceTelefone && digitos.length === 14 && cnpjValido(digitos)) return { tipo: "cnpj", valor: digitos };
  if (!pareceTelefone && digitos.length === 11 && cpfValido(digitos)) return { tipo: "cpf", valor: digitos };
  let fone = digitos;
  if ((fone.length === 12 || fone.length === 13) && fone.startsWith("55")) fone = fone.slice(2);
  if (fone.length === 10 || fone.length === 11) return { tipo: "telefone", valor: `+55${fone}` };
  return null;
}

export function tipoChaveValido(v: unknown): TipoChavePix | null {
  return v === "cpf" || v === "cnpj" || v === "telefone" || v === "email" || v === "aleatoria" ? v : null;
}

export const ROTULO_CHAVE: Record<TipoChavePix, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  telefone: "celular",
  email: "e-mail",
  aleatoria: "chave aleatória",
};

/** Texto sem acentos e só com caracteres aceitos no BR Code. */
function limparTexto(s: string, max: number) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const campo = (id: string, valor: string) => `${id}${String(valor.length).padStart(2, "0")}${valor}`;

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido no campo 63 do BR Code. */
export function crc16(texto: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Monta o "Pix copia e cola". O valor é opcional (sem valor, o cliente digita);
 * o identificador (txid) usa só letras e números, até 25 caracteres ("***" quando ausente).
 */
export function pixCopiaECola(opcoes: { chave: string; tipoChave?: TipoChavePix | null; nome: string; cidade?: string | null; valor?: number | null; identificador?: string | null }) {
  const chave = normalizarChavePix(opcoes.chave, opcoes.tipoChave);
  if (!chave) return null;
  const nome = limparTexto(opcoes.nome, 25) || "RECEBEDOR";
  const cidade = limparTexto(opcoes.cidade ?? "", 15) || "BRASIL";
  const txid = (opcoes.identificador ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const valor = opcoes.valor != null && Number.isFinite(opcoes.valor) && opcoes.valor > 0 ? opcoes.valor.toFixed(2) : null;
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", chave.valor);
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (valor ? campo("54", valor) : "") +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", txid)) +
    "6304";
  return semCrc + crc16(semCrc);
}
