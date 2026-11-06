export function FixtureBadge({ from }: { from: "live" | "fixture" }) {
  if (from !== "fixture") return null;
  return (
    <span className="databadge" title="Shown from saved example data, not a live result">
      <span className="sr-only">Data source: </span>fixture
    </span>
  );
}
