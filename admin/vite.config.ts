// Painel de administração da plataforma: site estático separado do sistema das
// confeitarias, publicado no GitHub Pages. Usa o mesmo banco (Supabase) e os
// componentes visuais de src/. Build: bunx vite build --config admin/vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const aqui = (caminho: string) => fileURLToPath(new URL(caminho, import.meta.url));

export default defineConfig({
  root: aqui("."),
  base: "./",
  envDir: aqui(".."),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": aqui("../src") } },
  build: { outDir: aqui("../dist-admin"), emptyOutDir: true },
});
