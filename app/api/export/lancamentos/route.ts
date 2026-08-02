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

/**
 * Baixa todos os lançamentos em CSV (backup do usuário). O middleware não
 * cobre /api, então a sessão é checada aqui — e a resposta é 401, não um
 * redirect, para não baixar a página de login com cara de CSV.
 */
export async function GET() {
  const session = await auth();
  if (!session) return new Response("Não autorizado", { status: 401 });

  const rows = await prisma.monthlyEntry.findMany({
    include: {
      item: { include: { category: true } },
      category: true,
      card: { select: { name: true } },
    },
    orderBy: [{ month: "asc" }, { id: "asc" }],
  });

  const linhas: CsvCell[][] = rows.map((r) => {
    const categoria = r.item?.category ?? r.category;
    return [
      monthStringFromDate(r.month),
      r.item?.name ?? r.card?.name ?? r.description ?? "",
      categoria?.name ?? "",
      categoria?.type === "INCOME" ? "Receita" : "Despesa",
      r.card?.name ?? "",
      csvDate(r.purchaseDate),
      csvMoney(decimalToCents(String(r.plannedAmount))),
      r.paid ? "Sim" : "Não",
      r.paidAmount === null ? "" : csvMoney(decimalToCents(String(r.paidAmount))),
      csvDate(r.paidDate),
      r.installmentSeq && r.installmentCount ? `${r.installmentSeq}/${r.installmentCount}` : "",
    ];
  });

  const csv = toCsv(
    [
      "Competência",
      "Descrição",
      "Categoria",
      "Tipo",
      "Cartão",
      "Data",
      "Previsto",
      "Pago",
      "Valor pago",
      "Data do pagamento",
      "Parcela",
    ],
    linhas,
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grana-lancamentos-${fileStamp()}.csv"`,
    },
  });
}
