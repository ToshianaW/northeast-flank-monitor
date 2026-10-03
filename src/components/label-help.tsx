/** One-line plain-language key for the confidence and state-source labels. */
export function LabelHelp({
  className = "",
  size = "base",
}: {
  className?: string;
  /** "small" is a quiet footnote, for pages where the key sits under the content. */
  size?: "base" | "small";
}) {
  const sizeClass = size === "small" ? "text-xs text-text-muted" : "text-base text-text-secondary";
  return (
    <p className={`${sizeClass} ${className}`}>
      Confidence shows how well the attached evidence supports an event, from
      Confirmed to Unverified. &ldquo;State / official source&rdquo; marks
      official Russian or Belarusian sources, whose claims are reported with
      attribution and are not independently verified.
    </p>
  );
}
