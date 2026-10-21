import { CHANGELOG } from "@/lib/changelog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { appName } from "@/lib/branding";

/** "2026-08-04" → "4 de agosto de 2026". */
function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso + "T00:00:00Z"));
}

/** Quantas versões ficam à vista; as outras abrem com um clique. */
const RECENT = 6;

function entryCard(e: (typeof CHANGELOG)[number]) {
  return (
    <Card key={`${e.version}-${e.date}-${e.title}`}>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{formatDateLong(e.date)}</span>
          <Badge variant="secondary" className="tabular-nums">
            v{e.version}
          </Badge>
        </div>
        <p className="font-semibold">{e.title}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {e.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function NovidadesPage() {
  const recent = CHANGELOG.slice(0, RECENT);
  const older = CHANGELOG.slice(RECENT);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Novidades</h1>
        <p className="text-sm text-muted-foreground">O que mudou no {appName()} a cada atualização.</p>
      </div>
      <div className="space-y-4">
        {recent.map(entryCard)}
        {older.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-sm text-muted-foreground hover:text-foreground">
              <span className="group-open:hidden">Mostrar as {older.length} versões anteriores</span>
              <span className="hidden group-open:inline">Ocultar as versões anteriores</span>
            </summary>
            <div className="mt-4 space-y-4">{older.map(entryCard)}</div>
          </details>
        )}
      </div>
    </div>
  );
}
