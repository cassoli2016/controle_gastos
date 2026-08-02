import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decimalToCents } from "@/lib/money";
import { monthStringFromDate } from "@/lib/dates";
import { todayISOInSaoPaulo } from "@/lib/fatura";
import { toCsv, csvMoney, csvDate, type CsvCell } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

/** "2026-08-02" → "02-08-2026" (nome de arquivo legível). */
function fileStamp(): string {
  const iso = todayISOInSaoPaulo();
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

/** Classificação da linha do extrato para leitura na planilha. */
function tipoLinha(t: { prepayment: boolean; subscriptionId: string | null; amountCents: number }): string {
  if (t.prepayment) return "Antecipação";
  if (t.subscriptionId) return "Assinatura";
  return t.amountCents < 0 ? "Estorno" : "Compra";
}

/** Baixa todo o extrato de cartão em CSV (backup do usuário). */
export async function GET() {
  const session = await auth();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const rows = await prisma.cardTransaction.findMany({
    include: { card: { select: { name: true } } },
    orderBy: [{ month: "asc" }, { purchaseDate: "asc" }, { id: "asc" }],
  });

  const linhas: CsvCell[][] = rows.map((t) => {
    const amountCents = decimalToCents(String(t.amount));
    return [
      t.card.name,
      monthStringFromDate(t.month),
      csvDate(t.purchaseDate),
      t.description,
      csvMoney(amountCents),
      t.installmentSeq && t.installmentCount ? `${t.installmentSeq}/${t.installmentCount}` : "",
      tipoLinha({ prepayment: t.prepayment, subscriptionId: t.subscriptionId, amountCents }),
    ];
  });

  const csv = toCsv(
    ["Cartão", "Fatura", "Data da compra", "Descrição", "Valor", "Parcela", "Tipo"],
    linhas,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grana-extrato-${fileStamp()}.csv"`,
    },
  });
}
