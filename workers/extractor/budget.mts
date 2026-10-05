/**
 * Extractor spend limits (docs/running-costs.md). Pure arithmetic, tested in budget.test.mts.
 *
 * Each run may spend at most the per-run cap, and all runs together at most DAILY_BUDGET_USD in
 * any rolling 24 hours (recorded cost in extraction_runs, dry runs included: they cost money).
 * A row is judged against the run's pre-call estimate: one that could never fit the per-run cap
 * is skipped permanently; one that does not fit what is left this run waits for a later run, and
 * the loop moves on to later rows instead of stopping.
 */

export const PER_RUN_CAP_USD = 0.12;
export const DAILY_BUDGET_USD = 0.6;

/** Below this nothing useful fits (and extraction_runs stores the cap to 4 decimals, > 0). */
export const MIN_USEFUL_CAP_USD = 0.0001;

/** Effective cap for this run: min(per-run cap, daily budget − spend in the last 24 hours), never negative. */
export function effectiveCap(perRunCap: number, dailyBudget: number, spent24h: number): { cap: number; exhausted: boolean } {
  const cap = Math.max(0, Math.min(perRunCap, dailyBudget - spent24h));
  return { cap, exhausted: cap < MIN_USEFUL_CAP_USD };
}

export type RowBudgetDecision = "process" | "over_run_cap" | "too_long_for_cap";

/**
 * too_long_for_cap: the estimate alone exceeds the per-run cap, so it could never run (SKIPPED).
 * over_run_cap: it does not fit what is left of this run's effective cap (stays NEW).
 */
export function rowBudgetDecision(
  estimate: number,
  spentThisRun: number,
  effective: number,
  perRunCap: number,
): RowBudgetDecision {
  if (estimate > perRunCap) return "too_long_for_cap";
  if (spentThisRun + estimate > effective) return "over_run_cap";
  return "process";
}
