import {
  ACTIVITY_INDEX_DISCLAIMER,
  collectingText,
  dimensionLines,
  insufficientText,
  scopeText,
  type IndexResult,
} from "@/lib/activity-index";
import { unitName } from "@/lib/placement";

/**
 * Dashboard Activity Index. Band words and counts only: no score, no arrows, no red or heat
 * colours, and the spec §23 disclaimer verbatim. Until 12 complete weeks exist it shows
 * "Collecting baseline: week N of 12" and never a number.
 */
export function ActivityIndexPanel({ result }: { result: IndexResult }) {
  return (
    <div className="grid gap-3">
      {result.status === "collecting" ? (
        <p className="text-lg font-medium text-text-secondary">{collectingText(result)}</p>
      ) : result.status === "insufficient" ? (
        <p className="text-lg font-medium text-text-secondary">{insufficientText(result)}</p>
      ) : (
        <>
          <div>
            <p className="meta-label">Whole theater</p>
            <p className="text-base text-foreground">{scopeText(result.theater)}</p>
            {dimensionLines(result.theater).length > 0 ? (
              <p className="mt-1 text-sm text-text-secondary">{dimensionLines(result.theater).join(" · ")}</p>
            ) : null}
          </div>
          {result.areas.length > 0 ? (
            <ul className="grid gap-2">
              {result.areas.map((a) => (
                <li key={a.scope}>
                  <p className="meta-label">{unitName(a.scope)}</p>
                  <p className="text-sm text-text-secondary">{scopeText(a)}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-text-muted">
            Counts reflect reporting from sources already registered before the comparison began, not intensity of
            activity. Statements are not counted.
          </p>
        </>
      )}
      <p className="max-w-[65ch] text-sm leading-relaxed text-text-secondary">{ACTIVITY_INDEX_DISCLAIMER}</p>
    </div>
  );
}
