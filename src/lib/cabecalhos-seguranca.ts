// Cabeçalhos HTTP de segurança aplicados a toda resposta do servidor (src/server.ts).
//
// Não definimos X-Frame-Options/frame-ancestors nem uma CSP restritiva de propósito: o editor
// do Lovable abre o sistema dentro de um iframe, e uma CSP errada deixaria o site em branco.
// Antes de endurecer isso, teste a CSP em modo "Report-Only" (ver docs/conformidade-seguranca-lgpd.md).

export const CABECALHOS_SEGURANCA: Readonly<Record<string, string>> = {
  // Força HTTPS por 1 ano nos navegadores que já visitaram o site.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // Impede o navegador de "adivinhar" o tipo de um arquivo (evita executar upload como script).
  "X-Content-Type-Options": "nosniff",
  // Não vaza o endereço completo (que pode ter código de pedido) para outros sites.
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // O sistema não usa estes recursos do aparelho; bloqueia mesmo se um script tentar.
  "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
  // Isola a janela do site de janelas abertas por outros sites.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

/** Devolve a resposta com os cabeçalhos de segurança, sem sobrescrever os que o servidor já definiu. */
export function comCabecalhosDeSeguranca(resposta: Response): Response {
  // Resposta de troca de protocolo (WebSocket) não pode ser reconstruída.
  if (resposta.status === 101) return resposta;
  const faltando = Object.entries(CABECALHOS_SEGURANCA).filter(([nome]) => !resposta.headers.has(nome));
  if (faltando.length === 0) return resposta;
  try {
    for (const [nome, valor] of faltando) resposta.headers.set(nome, valor);
    return resposta;
  } catch {
    // Cabeçalhos imutáveis (resposta vinda de fetch): reconstrói com uma cópia.
    const cabecalhos = new Headers(resposta.headers);
    for (const [nome, valor] of faltando) cabecalhos.set(nome, valor);
    return new Response(resposta.body, { status: resposta.status, statusText: resposta.statusText, headers: cabecalhos });
  }
}
