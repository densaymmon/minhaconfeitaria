// Web Push sem dependências: criptografia aes128gcm (RFC 8291/8188) e assinatura VAPID (RFC 8292)
// usando apenas a WebCrypto (funciona no servidor do app e no Node). Testado em web-push.test.ts.

export type InscricaoPush = { endpoint: string; p256dh: string; auth: string };
export type ChavesVapid = { publica: string; privada: string; assunto: string };

const texto = new TextEncoder();

export function paraBase64Url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64Url(valor: string) {
  const b64 = valor.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function juntar(...partes: Uint8Array[]) {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { saida.set(p, pos); pos += p.length; }
  return saida;
}

/** Cópia em ArrayBuffer próprio (evita problemas de tipo/visão com a WebCrypto). */
const buf = (u: Uint8Array) => u.slice().buffer as ArrayBuffer;

async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, tamanho: number) {
  const chave = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(sal), info: buf(info) }, chave, tamanho * 8));
}

/** JWK de uma chave P-256 a partir do "d" (base64url) e do ponto público não comprimido (65 bytes). */
function jwkPrivada(d: string, publica: Uint8Array): JsonWebKey {
  if (publica.length !== 65 || publica[0] !== 4) throw new Error("Chave pública P-256 inválida.");
  return { kty: "EC", crv: "P-256", d, x: paraBase64Url(publica.slice(1, 33)), y: paraBase64Url(publica.slice(33, 65)), ext: true };
}

/**
 * Criptografa a mensagem para a inscrição (aes128gcm, um único registro).
 * `fixo` só existe para os testes com o exemplo do RFC 8291.
 */
export async function criptografarPush(inscricao: Pick<InscricaoPush, "p256dh" | "auth">, mensagem: Uint8Array, fixo?: { sal: Uint8Array; privada: string; publica: Uint8Array }) {
  const uaPublica = deBase64Url(inscricao.p256dh);
  const segredo = deBase64Url(inscricao.auth);
  if (uaPublica.length !== 65 || segredo.length < 16) throw new Error("Inscrição de notificação inválida.");

  let asPrivada: CryptoKey;
  let asPublica: Uint8Array;
  if (fixo) {
    asPrivada = await crypto.subtle.importKey("jwk", jwkPrivada(fixo.privada, fixo.publica), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    asPublica = fixo.publica;
  } else {
    const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    asPrivada = par.privateKey;
    asPublica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  }
  const sal = fixo?.sal ?? crypto.getRandomValues(new Uint8Array(16));

  const chaveUa = await crypto.subtle.importKey("raw", buf(uaPublica), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: chaveUa }, asPrivada, 256));
  const ikm = await hkdf(segredo, ecdh, juntar(texto.encode("WebPush: info\0"), uaPublica, asPublica), 32);
  const cek = await hkdf(sal, ikm, texto.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, texto.encode("Content-Encoding: nonce\0"), 12);

  const chaveAes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  // Registro único: mensagem + delimitador 0x02 (sem preenchimento extra).
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, chaveAes, buf(juntar(mensagem, new Uint8Array([2])))));
  const tamanhoRegistro = new Uint8Array([0, 0, 16, 0]); // 4096
  return juntar(sal, tamanhoRegistro, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

/** Cabeçalho Authorization VAPID (JWT ES256 válido por 12 horas). */
export async function cabecalhoVapid(endpoint: string, vapid: ChavesVapid, agora = Date.now()) {
  const publica = deBase64Url(vapid.publica);
  const chave = await crypto.subtle.importKey("jwk", jwkPrivada(vapid.privada, publica), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cab = paraBase64Url(texto.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = paraBase64Url(texto.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(agora / 1000) + 12 * 3600, sub: vapid.assunto })));
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, buf(texto.encode(`${cab}.${corpo}`))));
  return `vapid t=${cab}.${corpo}.${paraBase64Url(assinatura)}, k=${vapid.publica}`;
}

/** Só envia para serviços de push conhecidos (evita usar o servidor para chamar endereços arbitrários). */
export function endpointPermitido(endpoint: string) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    return [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /^android\.googleapis\.com$/]
      .some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

/** Envia a notificação. Devolve o status HTTP (404/410 = inscrição expirada, pode apagar). */
export async function enviarPush(inscricao: InscricaoPush, dados: unknown, vapid: ChavesVapid, opcoes: { ttl?: number; urgencia?: "normal" | "high" } = {}) {
  if (!endpointPermitido(inscricao.endpoint)) return 400;
  const corpo = await criptografarPush(inscricao, texto.encode(JSON.stringify(dados)));
  const resposta = await fetch(inscricao.endpoint, {
    method: "POST",
    headers: {
      Authorization: await cabecalhoVapid(inscricao.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opcoes.ttl ?? 24 * 3600),
      Urgency: opcoes.urgencia ?? "high",
    },
    body: buf(corpo),
  });
  return resposta.status;
}
