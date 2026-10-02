/** One-line plain-language key for the confidence and state-source labels. */
export function LabelHelp({ className = "" }: { className?: string }) {
  return (
    <p className={`text-base text-text-secondary ${className}`}>
      Confidence shows how well the attached evidence supports an event, from
      Confirmed to Unverified. &ldquo;State / official source&rdquo; marks
      official Russian or Belarusian sources, whose claims are reported with
      attribution and are not independently verified.
    </p>
  );
}
