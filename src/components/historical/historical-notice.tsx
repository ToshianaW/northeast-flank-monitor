import { coverageNote, HISTORICAL_LABEL, type HistoricalCoverage } from "@/lib/historical-rules";

/**
 * Shown on every historical page: the record label and how much of the period it covers.
 * `listEmptyMonths` false leaves out the "No entries yet: …" month roll-call.
 */
export function HistoricalNotice({
  coverage,
  listEmptyMonths = true,
}: {
  coverage: HistoricalCoverage;
  listEmptyMonths?: boolean;
}) {
  return (
    <div className="grid gap-2 border-l-2 border-teal-blue bg-surface-dark px-4 py-3">
      <p className="font-medium text-foreground">{HISTORICAL_LABEL}</p>
      <p className="text-sm text-text-secondary">{coverageNote(coverage, { listEmptyMonths })}</p>
    </div>
  );
}
