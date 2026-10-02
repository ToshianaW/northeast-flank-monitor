import Link from "next/link";
import { connection } from "next/server";
import { formatEventDate, formatUtcTime } from "@/components/event-log-entry";
import { SiteNav } from "@/components/site-nav";
import { getLastPublishedUpdate } from "@/lib/public-events";

export async function SiteHeader() {
  await connection();
  const lastUpdate = await getLastPublishedUpdate();

  return (
    <header className="border-b border-border bg-deep-navy/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="block">
              <p className="font-sans text-lg font-semibold tracking-wide text-foreground sm:text-xl">
                Northeast Flank Monitor
              </p>
            </Link>
            <p className="mt-1 max-w-xl text-sm text-text-secondary">
              Open-source monitoring of military activity across NATO&apos;s
              northeastern flank.
            </p>
          </div>
          <div className="flex items-center gap-2 sm:text-right">
            <span
              className="live-dot inline-block h-2 w-2 rounded-full"
              aria-hidden
            />
            <div>
              <p className="meta-label">Last update</p>
              <p className="font-mono text-xs text-text-secondary">
                {lastUpdate
                  ? `${formatEventDate(lastUpdate)} · ${formatUtcTime(lastUpdate)}`
                  : "No data yet"}
              </p>
            </div>
          </div>
        </div>
        <SiteNav />
      </div>
    </header>
  );
}
