export function FixtureBadge({ from }: { from: "live" | "fixture" }) {
  if (from !== "fixture") return null;
  return (
    <span className="databadge" title="Shown from saved example data">
      <span className="sr-only">Data source: </span>Example data
    </span>
  );
}
