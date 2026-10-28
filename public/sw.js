// Service worker do Doce Gestão: só cuida das notificações de pedido novo.
// Não guarda páginas em cache (cada publicação nova chega na hora).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let dados = {};
  try { dados = evento.data ? evento.data.json() : {}; } catch { dados = { corpo: evento.data ? evento.data.text() : "" }; }
  const titulo = dados.titulo || "Novo pedido pelo catálogo";
  evento.waitUntil(self.registration.showNotification(titulo, {
    body: dados.corpo || "Abra o sistema para ver o pedido.",
    tag: dados.tag || "pedido-novo",
    renotify: true,
    icon: "/icons/icone-192.png",
    badge: "/icons/selo-96.png",
    data: { url: dados.url || "/painel" },
  }));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL((evento.notification.data && evento.notification.data.url) || "/painel", self.location.origin).href;
  evento.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const janela of abertas) {
      if (new URL(janela.url).origin === self.location.origin && "focus" in janela) {
        await janela.focus();
        if ("navigate" in janela) await janela.navigate(destino).catch(() => undefined);
        return;
      }
    }
    await self.clients.openWindow(destino);
  })());
});
