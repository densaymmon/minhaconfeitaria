import { describe, expect, it } from "vitest";
import { cabecalhoVapid, criptografarPush, deBase64Url, endpointPermitido, paraBase64Url } from "./web-push";

// Exemplo do RFC 8291, apêndice A.
const RFC = {
  mensagem: "When I grow up, I want to be a watermelon",
  asPrivada: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  asPublica: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  uaPrivada: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  uaPublica: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  sal: "DGv6ra1nlYgDCS1FRnbzlw",
  corpo: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("web push", () => {
  it("converte base64url nos dois sentidos", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(paraBase64Url(deBase64Url(paraBase64Url(bytes)))).toBe(paraBase64Url(bytes));
    expect(paraBase64Url(bytes)).toBe("AAH6-_z9_v8");
  });

  it("criptografa igual ao exemplo do RFC 8291", async () => {
    const corpo = await criptografarPush({ p256dh: RFC.uaPublica, auth: RFC.auth }, new TextEncoder().encode(RFC.mensagem), {
      sal: deBase64Url(RFC.sal), privada: RFC.asPrivada, publica: deBase64Url(RFC.asPublica),
    });
    expect(paraBase64Url(corpo)).toBe(RFC.corpo);
  });

  it("gera mensagens diferentes a cada envio (chave e sal aleatórios)", async () => {
    const a = await criptografarPush({ p256dh: RFC.uaPublica, auth: RFC.auth }, new TextEncoder().encode("oi"));
    const b = await criptografarPush({ p256dh: RFC.uaPublica, auth: RFC.auth }, new TextEncoder().encode("oi"));
    expect(paraBase64Url(a) === paraBase64Url(b)).toBe(false);
    expect(a.length).toBe(16 + 4 + 1 + 65 + 2 + 1 + 16);
  });

  it("assina o VAPID com ES256 verificável pela chave pública", async () => {
    const cab = await cabecalhoVapid("https://fcm.googleapis.com/fcm/send/abc", { publica: RFC.asPublica, privada: RFC.asPrivada, assunto: "mailto:x@y.com" }, 1_700_000_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(cab);
    expect(m !== null).toBe(true);
    const [, h, c, s, k] = m ?? [];
    expect(JSON.parse(new TextDecoder().decode(deBase64Url(c ?? "")))).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_043_200, sub: "mailto:x@y.com" });
    const chave = await crypto.subtle.importKey("raw", deBase64Url(k ?? "").slice().buffer as ArrayBuffer, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, chave, deBase64Url(s ?? "").slice().buffer as ArrayBuffer, new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it("só envia para serviços de push conhecidos", () => {
    expect(endpointPermitido("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(endpointPermitido("https://web.push.apple.com/abc")).toBe(true);
    expect(endpointPermitido("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(endpointPermitido("https://wns2-bl2p.notify.windows.com/w/?token=x")).toBe(true);
    expect(endpointPermitido("http://fcm.googleapis.com/x")).toBe(false);
    expect(endpointPermitido("https://169.254.169.254/latest")).toBe(false);
    expect(endpointPermitido("https://fcm.googleapis.com.evil.com/x")).toBe(false);
    expect(endpointPermitido("lixo")).toBe(false);
  });
});
