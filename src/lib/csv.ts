// Exportação CSV compatível com Excel em português (separador ";" e BOM UTF-8).

type Cell = string | number | boolean | null | undefined;

export function toCSV(headers: string[], rows: Cell[][]) {
  const esc = (c: Cell) => {
    if (c === null || c === undefined) return "";
    let s = typeof c === "number" ? String(c).replace(".", ",") : typeof c === "boolean" ? (c ? "Sim" : "Não") : String(c);
    if (typeof c === "string" && /^[\s]*[=+@\-]/.test(s)) s = "'" + s;
    if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

export function baixarCSV(nome: string, headers: string[], rows: Cell[][]) {
  const blob = new Blob(["\uFEFF" + toCSV(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome.endsWith(".csv") ? nome : `${nome}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
