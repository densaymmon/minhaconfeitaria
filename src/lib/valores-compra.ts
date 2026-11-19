// Conversões de valores digitados na tela de compras (quantidade, preço e total).
// Funções puras, testadas em valores-compra.test.ts.

// Nunca permita que valores numéricos inválidos vindos do banco apareçam como "NaN"
// em campos controlados; valores ausentes permanecem vazios e editáveis.
export function textoCampoNumerico(valor: unknown): string {
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  if (typeof valor !== "string") return "";
  const texto = valor.trim();
  if (!texto || ["nan", "infinity", "-infinity", "undefined", "null"].includes(texto.toLowerCase())) return "";
  return texto;
}

// Aceita ponto ou vírgula como separador decimal sem alterar o texto durante a digitação.
export function numeroCompra(valor: string): number {
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

export function valorTotalEditavel(item: { total: unknown; preco_unitario: unknown; quantidade: unknown }): string {
  const total = typeof item.total === "number" ? item.total : Number(item.total);
  if (Number.isFinite(total) && total >= 0) return String(total);
  const unitario = typeof item.preco_unitario === "number" ? item.preco_unitario : Number(item.preco_unitario);
  const quantidade = typeof item.quantidade === "number" ? item.quantidade : Number(item.quantidade);
  const calculado = unitario * quantidade;
  return Number.isFinite(calculado) && calculado >= 0 ? String(calculado) : "";
}

// O estado guarda apenas dígitos (centavos); a máscara é aplicada só na exibição.
// Separar o texto cru do texto formatado evita que a vírgula mova o cursor ou apague a digitação.
export function formatarValorMonetario(digitos: string): string {
  const somenteDigitos = digitos.replace(/\D/g, "");
  if (!somenteDigitos) return "";
  const centavos = Number(somenteDigitos);
  if (!Number.isSafeInteger(centavos)) return "";
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function valorMonetarioEmCentavos(valor: string): number {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return NaN;
  const centavos = Number(digitos);
  return Number.isSafeInteger(centavos) ? centavos / 100 : NaN;
}

// Converte valores já salvos em reais para o estado cru em centavos, ao editar uma compra.
export function valorExistenteEmCentavos(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return "";
  return String(Math.round((numero + Number.EPSILON) * 100));
}
