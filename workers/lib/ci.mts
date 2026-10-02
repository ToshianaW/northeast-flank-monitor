/**
 * GitHub Actions helpers for the --ci flag (roadmap step 2.6).
 * Step outputs must be counts or short codes only: the repository and its logs are public.
 */
import { appendFileSync } from "node:fs";

/** Appends a step output when running in GitHub Actions; a no-op elsewhere. */
export function setOutput(name: string, value: string | number): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
}
