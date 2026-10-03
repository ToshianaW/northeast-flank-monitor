import { heatColor } from "@/lib/map-style";

/** Count in the same steps and heat colours as the dots (none, 1, 2-3, 4+). Never red. */
const STEP_MIX = [0, 22, 30, 40];

export function CountChip({ count, step }: { count: number; step: 0 | 1 | 2 | 3 }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-xs tabular-nums"
      style={{
        borderColor: step === 0 ? "var(--border)" : heatColor(step),
        backgroundColor: step === 0 ? "transparent" : `color-mix(in srgb, ${heatColor(step)} ${STEP_MIX[step]}%, transparent)`,
        color: step === 0 ? "var(--text-muted)" : "var(--foreground)",
      }}
    >
      {count === 1 ? "1 item" : `${count} items`}
    </span>
  );
}
