import Link from "next/link";

export const metadata = { title: "About" };

const REPOSITORY_URL = "https://github.com/ToshianaW/northeast-flank-monitor";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="meta-label mb-3">{title}</h2>
      <div className="grid max-w-3xl gap-3 text-base leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">About</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        About Northeast Flank Monitor
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-text-secondary">
        Independent open-source monitoring of military activity across
        Kaliningrad, Belarus, Poland and the Baltic states.
      </p>

      <div className="mt-10 grid gap-10">
        <Block title="Purpose">
          <p className="text-lg font-medium text-foreground">
            Is the regional military baseline changing?
          </p>
          <p>
            The site tracks military activity, exercises, readiness changes,
            official alerts, force movements, air activity, border incidents,
            and logistics indicators across NATO&apos;s northeastern flank, and
            records whether that activity returns to baseline over time.
          </p>
          <p>
            The core purpose is not to predict war. Observe behavior. Track the
            baseline. Compare historically. Do not predict intent.
          </p>
          <p>
            How events are selected, sourced, and reviewed is described on the{" "}
            <Link href="/methodology" className="link">
              Methodology
            </Link>{" "}
            page.
          </p>
        </Block>

        <Block title="Open source">
          <p>
            The code is open source and developed in public on{" "}
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              GitHub
            </a>
            . The license has not been finalized yet.
          </p>
        </Block>

        <Block title="Independence">
          <p>
            Northeast Flank Monitor is an independent project. It is not
            affiliated with any government or military.
          </p>
        </Block>

        <Block title="Contact and contributing">
          <p>
            <span className="text-foreground">Contact:</span>{" "}
            <span className="border border-dashed border-text-muted px-1.5 py-0.5 font-mono text-xs text-text-muted">
              [Placeholder — contact method to be added]
            </span>
          </p>
          <p>
            Corrections, source suggestions, and code contributions can be
            raised on the{" "}
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              GitHub repository
            </a>
            . Contribution guidelines are still being written.
          </p>
        </Block>
      </div>
    </div>
  );
}
