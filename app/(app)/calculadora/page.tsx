import { Calculadora } from "./Calculadora";

export default function CalculadoraPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">À vista ou parcelado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O desconto à vista compensa o rendimento que o dinheiro faria parado na reserva?
        </p>
      </div>
      <Calculadora />
    </div>
  );
}
