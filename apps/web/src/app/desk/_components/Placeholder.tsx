// Marks a fixture value that is our draft, not the brain's. Shown only in fixture mode.
export function Placeholder({ what }: { what: string }) {
  return (
    <span
      className="mono inline-flex items-center rounded-pill border border-dashed border-ink-2 px-2.5 text-xs leading-[1.5] text-ink-2"
      title={`Placeholder: ${what}`}
    >
      placeholder
    </span>
  );
}
