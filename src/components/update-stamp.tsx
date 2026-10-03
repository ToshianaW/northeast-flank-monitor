import { connection } from "next/server";
import { formatEventDate, formatUtcTime } from "@/components/event-log-entry";
import { getLastPublishedUpdate } from "@/lib/public-events";

/** "Updated 11:42 UTC" for the top bar; the date is added when it isn't today (UTC). */
export async function UpdateStamp() {
  await connection();
  const lastUpdate = await getLastPublishedUpdate();

  if (!lastUpdate) {
    return <p className="shrink-0 font-mono text-xs text-text-muted">No data yet</p>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sameDay = lastUpdate.toISOString().slice(0, 10) === today;

  return (
    <p className="flex shrink-0 items-center gap-2 font-mono text-xs text-text-secondary">
      <span className="status-dot" aria-hidden />
      Updated{" "}
      <time dateTime={lastUpdate.toISOString()}>
        {sameDay ? "" : `${formatEventDate(lastUpdate)} · `}
        {formatUtcTime(lastUpdate)}
      </time>
    </p>
  );
}
