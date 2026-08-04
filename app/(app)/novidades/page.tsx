import { CHANGELOG } from "@/lib/changelog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** "2026-08-04" → "4 de agosto de 2026". */
function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso + "T00:00:00Z"));
}

export default function NovidadesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Novidades</h1>
        <p className="text-sm text-muted-foreground">O que mudou no Grana a cada atualização.</p>
      </div>
      <div className="space-y-4">
        {CHANGELOG.map((e) => (
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
        ))}
      </div>
    </div>
  );
}
