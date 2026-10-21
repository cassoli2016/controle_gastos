import Link from "next/link";
import { Download, ChevronRight } from "lucide-react";
import { listPasskeys } from "@/lib/passkey";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PasskeyManager } from "./PasskeyManager";

/**
 * Ajustes: o que é do app (segurança, dados) e um mapa do que se configura em
 * cada tela — teto do cartão, meta de categoria e reserva do dia a dia moram
 * onde são usados, e esta lista diz onde.
 */
const ONDE = [
  { href: "/cartoes", title: "Teto e limite dos cartões", detail: "Em Cartões, Editar em cada cartão: limite do banco e teto mensal que você quer respeitar." },
  { href: "/categorias", title: "Metas por categoria", detail: "Em Categorias, Editar: a meta mensal que alimenta o Orçamento do mês." },
  { href: "/reservas", title: "Reserva do dia a dia", detail: "Em Reservas: o valor por dia que o app provisiona para o gasto variável." },
  { href: "/itens", title: "Renovações, reajustes e cadência das contas", detail: "Em Itens, Editar: mês de renovação, reajuste anual, frequência e dia útil." },
];

export default async function AjustesPage() {
  const passkeys = await listPasskeys();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">Ajustes</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Segurança</h2>
        <Card>
          <CardContent>
            <PasskeyManager passkeys={passkeys} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Seus dados</h2>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Exportar em CSV</div>
              <p className="text-xs text-muted-foreground">Uma cópia do que está no app, para abrir no Excel ou guardar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/lancamentos" download>
                  <Download />
                  Lançamentos
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/api/export/extrato" download>
                  <Download />
                  Extrato de cartão
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Onde configurar</h2>
        <Card className="py-0">
          <ul className="divide-y">
            {ONDE.map((o) => (
              <li key={o.href}>
                <Link href={o.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{o.title}</span>
                    <span className="block text-xs text-muted-foreground">{o.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
