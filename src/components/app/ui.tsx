import type { ReactNode, SelectHTMLAttributes } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {back && (
        <Link
          to={back}
          aria-label="Voltar"
          className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-card shadow-soft"
        >
          <ArrowLeft className="size-4" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl bg-card p-4 shadow-soft", className)}>{children}</div>;
}

export function Stat({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "primary" | "success" | "danger";
  hint?: string;
}) {
  const tones = {
    default: "text-foreground",
    primary: "text-primary",
    success: "text-success",
    danger: "text-destructive",
  };
  return (
    <Card className="p-3.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-bold tabular-nums", tones[tone])}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

const statusTone: Record<string, string> = {
  recebido: "bg-muted text-muted-foreground",
  confirmado: "bg-info/15 text-info",
  em_producao: "bg-warning/25 text-warning-foreground",
  pronto: "bg-success/15 text-success",
  entregue: "bg-primary/10 text-primary",
  cancelado: "bg-destructive/10 text-destructive line-through",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", statusTone[status])}>
      {statusLabel(status)}
    </span>
  );
}

export function Row({ label, value, strong, tone }: { label: string; value: ReactNode; strong?: boolean; tone?: "success" | "danger" }) {
  return (
    <div className={cn("flex justify-between py-1 text-sm", strong && "font-bold")}>
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span className={cn("tabular-nums", tone === "success" && "text-success", tone === "danger" && "text-destructive")}>
        {value}
      </span>
    </div>
  );
}
