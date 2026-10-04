import "server-only";
import { after } from "next/server";
import { getPool } from "./db";
import { processXQueue, xSettingsFromEnv } from "./x-queue";

/** Items posted per save; anything left waits for the next save or `npm run x:post -- --post`. */
const PER_SAVE_LIMIT = 3;

/**
 * NOT CALLED at present: automatic posting is switched off (X charges per post; posts are copied
 * by hand from the admin review page instead). The triggers still queue rows, so before calling
 * this again from the admin actions, mark the old backlog SKIPPED or it will all be posted.
 *
 * Called by admin save and approve actions: once the response has been sent, posts whatever the
 * publish triggers queued (migration 0009). Does nothing unless X_POSTING_ENABLED=true and the
 * four X keys are set. A failed post never affects the save; it is recorded on the queue row.
 */
export function postToXAfterResponse(): void {
  const settings = xSettingsFromEnv(process.env);
  if (!settings.enabled) return;
  after(async () => {
    try {
      const result = await processXQueue(getPool(), {
        live: true,
        creds: settings.creds,
        limit: PER_SAVE_LIMIT,
        dailyCap: settings.dailyCap,
        siteUrl: settings.siteUrl,
        log: (line) => console.log(`x:post ${line.split("\n")[0]}`),
      });
      if (result.capped) console.log(`x:post ${result.capped} held by the daily cap`);
    } catch (error) {
      console.error("x:post failed", error instanceof Error ? error.name : "Error");
    }
  });
}
