export function FixtureBadge({ from }: { from: "live" | "fixture" }) {
  if (from !== "fixture") return null;
  return (
    <span className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700" title="Shown from saved example data, not a live result">
      fixture data
    </span>
  );
}
