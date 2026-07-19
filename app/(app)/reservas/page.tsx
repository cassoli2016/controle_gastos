import { PiggyBank } from "lucide-react";
import { getReserves, getNegativeMonths } from "@/lib/planning";
import { sumCents, formatCents } from "@/lib/money";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { NewReserveForm } from "./NewReserveForm";
import { ReserveCard } from "./ReserveCard";

export default async function ReservasPage() {
  const [reserves, negativeMonths] = await Promise.all([getReserves(), getNegativeMonths()]);
  const totalCents = sumCents(reserves.map((r) => r.amountCents));
  const uncoveredCents = sumCents(negativeMonths.map((m) => m.balanceCents)); // negativo

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
        <NewReserveForm />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatCard label="Total guardado" value={formatCents(totalCents)} tone="income" icon={PiggyBank} />
        {uncoveredCents < 0 && (
          <StatCard
            label="Descoberto (meses no vermelho)"
            value={formatCents(uncoveredCents)}
            tone="expense"
          />
        )}
      </div>

      {reserves.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <PiggyBank className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma caixinha ainda.</p>
            <p className="text-sm text-muted-foreground">
              Crie caixinhas para organizar sua reserva de emergência — quantas quiser.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reserves.map((r) => (
            <ReserveCard key={r.id} reserve={r} />
          ))}
        </div>
      )}
    </div>
  );
}
