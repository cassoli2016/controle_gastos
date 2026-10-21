"use server";
import { guardAction } from "@/lib/action-guard";
import { revalidateFinance } from "@/lib/revalidate";
import { takePatrimonySnapshot } from "@/lib/patrimony-snapshot";

export type ActionState = { error?: string; ok?: boolean };

/** Botão "Registrar hoje" do card de patrimônio: a mesma foto que o cron tira. */
export const takeSnapshotAction = guardAction(async function takeSnapshotAction(): Promise<ActionState> {
  await takePatrimonySnapshot();
  revalidateFinance();
  return { ok: true };
});
