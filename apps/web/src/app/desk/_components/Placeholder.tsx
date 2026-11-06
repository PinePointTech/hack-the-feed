// Marks a fixture value that is our draft, not the brain's. Shown only in fixture mode.
export function Placeholder({ what }: { what: string }) {
  return (
    <span className="databadge" title={`Placeholder: ${what}`}>
      placeholder
    </span>
  );
}
