"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import { digitsToCents } from "@/lib/currency-mask";
import { compareParcelamento } from "@/lib/parcelamento";

/** Aceita "1,5" e "1.5" — o teclado do celular manda vírgula. */
function pct(s: string): number {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function MoneyField({
  id,
  label,
  hint,
  cents,
  onCents,
}: {
  id: string;
  label: string;
  hint?: string;
  cents: number;
  onCents: (c: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={formatCents(cents)}
        onChange={(e) => onCents(digitsToCents(e.target.value))}
        className="text-right tabular-nums"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onValue,
  suffix,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onValue: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          className={cn("text-right tabular-nums", suffix && "pr-8")}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Calculadora() {
  const [fullCents, setFullCents] = useState(500_000);
  const [financedCents, setFinancedCents] = useState(500_000);
  // Enquanto o total parcelado não for editado à mão, ele segue o preço cheio:
  // o caso comum é "sem juros", e obrigar a digitar o mesmo número duas vezes
  // é atrito puro.
  const [financedTouched, setFinancedTouched] = useState(false);
  const [discount, setDiscount] = useState("5");
  const [maxN, setMaxN] = useState("10");
  const [rate, setRate] = useState("1");

  const n = Math.min(48, Math.max(1, Math.round(pct(maxN)) || 1));
  const r = compareParcelamento({
    fullCents,
    discountPct: pct(discount),
    financedCents: financedTouched ? financedCents : fullCents,
    maxInstallments: n,
    monthlyRatePct: pct(rate),
  });
  const best = r.best;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <MoneyField
            id="calc-cheio"
            label="Preço cheio"
            hint="O de etiqueta, sem desconto."
            cents={fullCents}
            onCents={(c) => {
              setFullCents(c);
              if (!financedTouched) setFinancedCents(c);
            }}
          />
          <NumberField
            id="calc-desconto"
            label="Desconto à vista"
            hint="Quanto a loja tira para pagamento à vista."
            value={discount}
            onValue={setDiscount}
            suffix="%"
          />
          <MoneyField
            id="calc-total"
            label="Total parcelado"
            hint="Igual ao preço cheio quando o parcelamento é sem juros."
            cents={financedTouched ? financedCents : fullCents}
            onCents={(c) => {
              setFinancedTouched(true);
              setFinancedCents(c);
            }}
          />
          <NumberField
            id="calc-vezes"
            label="Em até quantas vezes"
            hint="A tabela mostra todos os prazos até esse."
            value={maxN}
            onValue={setMaxN}
            suffix="x"
          />
          <NumberField
            id="calc-rendimento"
            label="Rendimento da reserva"
            hint="Por mês. É o que o dinheiro rende se você não gastar hoje."
            value={rate}
            onValue={setRate}
            suffix="%"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            À vista sai por {formatCents(r.cashCents)}
          </div>
          {best ? (
            <>
              <p className="text-xl font-bold">
                Parcele em {best.n}x de {formatCents(best.parcelCents)}
              </p>
              <p className="text-sm text-muted-foreground">
                As {best.n} parcelas valem {formatCents(best.presentValueCents)} em dinheiro de hoje —{" "}
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {formatCents(best.savingCents)} a menos
                </span>{" "}
                que o à vista. O desconto de {discount}% equivale a pagar{" "}
                {best.embeddedRatePct.toFixed(2).replace(".", ",")}% ao mês, e sua reserva rende{" "}
                {pct(rate).toFixed(2).replace(".", ",")}%.
              </p>
              {r.breakEvenN !== null && r.breakEvenN < best.n && (
                <p className="text-sm text-muted-foreground">
                  A partir de {r.breakEvenN}x já compensa; quanto mais longo o prazo, maior a vantagem.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Em compensação, prende {formatCents(best.parcelCents)} nas suas próximas {best.n} faturas.
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold">Pague à vista</p>
              <p className="text-sm text-muted-foreground">
                Em nenhum prazo até {n}x o parcelamento vale mais que o desconto. Parcelar custaria{" "}
                {r.options[n - 1].embeddedRatePct.toFixed(2).replace(".", ",")}% ao mês em {n}x, contra{" "}
                {pct(rate).toFixed(2).replace(".", ",")}% que a reserva rende.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Vezes</TableHead>
                <TableHead className="text-right">Parcela</TableHead>
                <TableHead className="text-right">Vale hoje</TableHead>
                <TableHead className="text-right">Contra à vista</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.options.map((o) => (
                <TableRow key={o.n} className={cn(best?.n === o.n && "bg-primary/5")}>
                  <TableCell className="font-medium tabular-nums">{o.n}x</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(o.parcelCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(o.presentValueCents)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      o.savingCents > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : o.savingCents < 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground",
                    )}
                  >
                    {o.savingCents > 0 ? "+" : ""}
                    {formatCents(o.savingCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
