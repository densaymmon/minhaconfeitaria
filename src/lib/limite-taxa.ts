// Limite de tentativas em memória (janela deslizante), para funções de servidor que custam dinheiro
// ou podem ser abusadas (ex.: leitura de pedido por IA).
//
// Limitação conhecida: o contador vive na memória de cada instância do servidor. Em hospedagem
// com várias instâncias o limite efetivo é maior que o configurado, mas ainda freia scripts e
// cliques repetidos. O limite definitivo para as funções públicas do catálogo fica no banco
// (ver docs/conformidade-seguranca-lgpd.md).

type Registro = number[];

const MAX_CHAVES = 5000;
const registros = new Map<string, Registro>();

export type ResultadoLimite = { permitido: true } | { permitido: false; esperarSegundos: number };

export function verificarLimite(chave: string, max: number, janelaMs: number, agora = Date.now()): ResultadoLimite {
  const inicio = agora - janelaMs;
  const tentativas = (registros.get(chave) ?? []).filter((t) => t > inicio);
  if (tentativas.length >= max) {
    registros.set(chave, tentativas);
    const maisAntiga = tentativas[0] ?? agora;
    return { permitido: false, esperarSegundos: Math.max(1, Math.ceil((maisAntiga + janelaMs - agora) / 1000)) };
  }
  tentativas.push(agora);
  registros.set(chave, tentativas);
  if (registros.size > MAX_CHAVES) limparAntigos(inicio);
  return { permitido: true };
}

function limparAntigos(inicio: number) {
  for (const [chave, tentativas] of registros) {
    if (tentativas.every((t) => t <= inicio)) registros.delete(chave);
  }
  // Se ainda estiver cheio (tudo recente), descarta as chaves mais antigas para limitar a memória.
  if (registros.size > MAX_CHAVES) {
    for (const chave of registros.keys()) {
      registros.delete(chave);
      if (registros.size <= MAX_CHAVES * 0.8) break;
    }
  }
}

/** Só para testes. */
export function zerarLimites() {
  registros.clear();
}
