import robotsParser from "robots-parser";

type Robot = ReturnType<typeof robotsParser>;

/**
 * robots.txt outcome per origin, following RFC 9309:
 * 2xx → parse rules; 4xx → no rules (allowed); 5xx or network error → treat as fully disallowed.
 */
type RobotsRules = { kind: "rules"; robot: Robot } | { kind: "allow-all" } | { kind: "deny-all"; reason: string };

export class RobotsDisallowedError extends Error {}

export class HttpClient {
  private readonly robots = new Map<string, RobotsRules>();
  private readonly nextSlot = new Map<string, number>();

  constructor(
    private readonly userAgent: string,
    private readonly timeoutMs: number,
    private readonly perHostIntervalMs: number,
  ) {}

  /** Wait until this host may be requested again, honoring any robots.txt Crawl-delay. */
  private async waitTurn(host: string, minIntervalMs: number): Promise<void> {
    const now = Date.now();
    const slot = this.nextSlot.get(host) ?? now;
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
    this.nextSlot.set(host, Math.max(slot, now) + minIntervalMs);
  }

  private intervalFor(origin: string, override?: number): number {
    const rules = this.robots.get(origin);
    const crawlDelay =
      rules?.kind === "rules" ? (rules.robot.getCrawlDelay(this.userAgent) ?? 0) * 1000 : 0;
    return Math.max(override ?? this.perHostIntervalMs, crawlDelay);
  }

  private async rawGet(url: string, intervalMs: number, redirect: RequestRedirect = "follow"): Promise<Response> {
    const { host } = new URL(url);
    await this.waitTurn(host, intervalMs);
    return fetch(url, {
      headers: { "User-Agent": this.userAgent, Accept: "*/*" },
      redirect,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private async loadRobots(origin: string): Promise<RobotsRules> {
    const cached = this.robots.get(origin);
    if (cached) return cached;

    const robotsUrl = `${origin}/robots.txt`;
    let rules: RobotsRules;
    try {
      const res = await this.rawGet(robotsUrl, this.perHostIntervalMs);
      if (res.ok) {
        rules = { kind: "rules", robot: robotsParser(robotsUrl, await res.text()) };
      } else if (res.status >= 400 && res.status < 500) {
        rules = { kind: "allow-all" };
      } else {
        rules = { kind: "deny-all", reason: `robots.txt returned HTTP ${res.status}` };
      }
    } catch (error) {
      rules = { kind: "deny-all", reason: `robots.txt unreachable (${errorMessage(error)})` };
    }
    this.robots.set(origin, rules);
    return rules;
  }

  /** Throws RobotsDisallowedError when robots.txt does not allow this URL for our user agent. */
  async assertAllowed(url: string): Promise<void> {
    const rules = await this.loadRobots(new URL(url).origin);
    if (rules.kind === "deny-all") throw new RobotsDisallowedError(rules.reason);
    if (rules.kind === "rules" && rules.robot.isAllowed(url, this.userAgent) === false) {
      throw new RobotsDisallowedError("disallowed by robots.txt");
    }
  }

  /**
   * robots.txt check, per-host rate limit, then GET. Non-2xx responses are returned, not thrown.
   * redirect "follow" (default) lets fetch follow any redirect. "same-host" follows up to 3
   * redirects only when they stay on the same host, checking robots.txt and the rate limit for
   * each hop; a redirect to another host is returned as-is (3xx).
   */
  async get(
    url: string,
    options: { minIntervalMs?: number; redirect?: "follow" | "same-host" } = {},
  ): Promise<{ status: number; body: string }> {
    let current = url;
    for (let hop = 0; ; hop++) {
      await this.assertAllowed(current);
      const { host, origin } = new URL(current);
      const interval = this.intervalFor(origin, options.minIntervalMs);
      const sameHost = options.redirect === "same-host";
      const res = await this.rawGet(current, interval, sameHost ? "manual" : "follow");
      const body = await res.text();
      // Count the gap from when the response finished, not when the request started:
      // slow responses would otherwise let the next request start too soon.
      this.nextSlot.set(host, Math.max(this.nextSlot.get(host) ?? 0, Date.now() + interval));
      const location = res.headers.get("location");
      if (!sameHost || res.status < 300 || res.status >= 400 || !location || hop >= 3) return { status: res.status, body };
      const next = new URL(location, current);
      if (next.host !== host) return { status: res.status, body };
      current = next.toString();
    }
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "request timed out";
    // fetch() reports network failures as "fetch failed" with the real reason in .cause.
    const cause = error.cause as { code?: string; message?: string } | undefined;
    return cause?.code || cause?.message ? `${error.message} (${cause.code ?? cause.message})` : error.message;
  }
  return String(error);
}
