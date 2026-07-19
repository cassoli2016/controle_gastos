import { TrendingUp, TrendingDown, Wallet, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { decimalToCents, formatCents, sumCents } from "@/lib/money";
import { calcPosition, calcPortfolio, formatPct } from "@/lib/investments";
import { StatCard } from "@/components/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshQuotesButton } from "./RefreshQuotesButton";
import { ImportB3Dialog } from "./ImportB3Dialog";
import { AssetForm } from "./AssetForm";
import { DividendReceiveButton, DividendDeleteButton, NewDividendForm } from "./DividendControls";

export const dynamic = "force-dynamic";

function fmtPrice(cents: number | null): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateBR(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export default async function InvestimentosPage() {
  const [assets, dividends] = await Promise.all([
    prisma.investmentAsset.findMany({ where: { active: true }, orderBy: { ticker: "asc" } }),
    prisma.dividend.findMany({ include: { asset: true }, orderBy: { payDate: "asc" } }),
  ]);

  const positions = assets
    .filter((a) => a.quantity > 0)
    .map((a) => {
      const avgPriceCents = Number(a.avgPrice) * 100;
      const lastPriceCents = a.lastPrice !== null ? Math.round(Number(a.lastPrice) * 100) : null;
      const calc = calcPosition({ quantity: a.quantity, avgPriceCents, lastPriceCents });
      return { asset: a, avgPriceCents, lastPriceCents, ...calc };
    });
  const totals = calcPortfolio(
    positions.map((p) => ({
      quantity: p.asset.quantity,
      avgPriceCents: p.avgPriceCents,
      lastPriceCents: p.lastPriceCents,
    })),
  );

  const pending = dividends.filter((d) => !d.received);
  const receivedList = dividends.filter((d) => d.received).slice(-8).reverse();
  const pendingCents = sumCents(pending.map((d) => decimalToCents(String(d.net))));
  const lastQuoteAt = assets
    .map((a) => a.priceAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Investimentos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshQuotesButton />
          <ImportB3Dialog />
          <AssetForm />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Investido (custo)" value={formatCents(totals.costCents)} icon={Wallet} />
        <StatCard
          label="Valor atual"
          value={formatCents(totals.valueCents)}
          tone={totals.resultCents >= 0 ? "income" : "expense"}
          icon={totals.resultCents >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label="Resultado"
          value={`${formatCents(totals.resultCents)} (${formatPct(totals.resultPct)})`}
          tone={totals.resultCents >= 0 ? "income" : "expense"}
          icon={totals.resultCents >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard label="Proventos a receber" value={formatCents(pendingCents)} tone="warn" icon={CalendarClock} />
      </div>

      {lastQuoteAt ? (
        <p className="text-xs text-muted-foreground">
          Cotações de {fmtDateBR(lastQuoteAt)} às {String(lastQuoteAt.getHours()).padStart(2, "0")}:
          {String(lastQuoteAt.getMinutes()).padStart(2, "0")}
          {totals.missingQuotes > 0 && ` · ${totals.missingQuotes} ativo(s) sem cotação (entram pelo custo)`}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sem cotações ainda — use &quot;Atualizar cotações&quot; (requer BRAPI_TOKEN no ambiente).
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Carteira</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {positions.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-muted-foreground">
              Nenhuma posição. Adicione com &quot;Nova posição&quot;.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">Ativo</th>
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">Cotas</th>
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">PM</th>
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">Cotação</th>
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">Valor</th>
                    <th className="px-3 py-1.5 font-medium text-muted-foreground">Resultado</th>
                    <th className="px-3 py-1.5 font-medium text-muted-foreground text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.asset.id} className="border-b last:border-b-0">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{p.asset.ticker}</span>
                          {p.asset.segment && (
                            <Badge variant="outline" className="font-normal text-muted-foreground">
                              {p.asset.segment}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">{p.asset.quantity.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtPrice(p.avgPriceCents)}</td>
                      <td className="px-3 py-1.5 tabular-nums">{fmtPrice(p.lastPriceCents)}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {p.valueCents !== null ? formatCents(p.valueCents) : formatCents(p.costCents)}
                      </td>
                      <td
                        className={`px-3 py-1.5 tabular-nums ${
                          p.resultCents === null
                            ? "text-muted-foreground"
                            : p.resultCents >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {p.resultCents !== null ? `${formatCents(p.resultCents)} (${formatPct(p.resultPct)})` : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end">
                          <AssetForm
                            defaults={{
                              ticker: p.asset.ticker,
                              segment: p.asset.segment ?? "",
                              quantity: p.asset.quantity,
                              avgPrice: Number(p.asset.avgPrice),
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>Proventos a receber</CardTitle>
            <NewDividendForm tickers={assets.map((a) => a.ticker)} />
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum provento em aberto.</p>
            ) : (
              <ul className="divide-y">
                {pending.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {fmtDateBR(d.payDate)}
                      </span>
                      <span className="font-medium">{d.asset.ticker}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {d.type}
                      </Badge>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums">{formatCents(decimalToCents(String(d.net)))}</span>
                      <DividendReceiveButton dividendId={d.id} received={false} />
                      <DividendDeleteButton dividendId={d.id} label={`${d.type} ${d.asset.ticker}`} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recebidos recentemente</CardTitle>
          </CardHeader>
          <CardContent>
            {receivedList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada recebido ainda.</p>
            ) : (
              <ul className="divide-y">
                {receivedList.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {fmtDateBR(d.payDate)}
                      </span>
                      <span className="font-medium">{d.asset.ticker}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {d.type}
                      </Badge>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCents(decimalToCents(String(d.net)))}
                      </span>
                      <DividendReceiveButton dividendId={d.id} received={true} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
