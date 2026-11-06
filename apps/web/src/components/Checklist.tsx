"use client";

export type ChecklistItem = { key: string; label: string; checked: boolean; disabled?: boolean; note?: string };

// Controlled: the parent owns the booleans.
export function Checklist({ items, onChange }: { items: ChecklistItem[]; onChange: (key: string, checked: boolean) => void }) {
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.key}>
          <label className={`flex items-start gap-3 text-lg ${it.disabled ? "opacity-60" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              name={it.key}
              className="mt-1 h-5 w-5 accent-blue-700"
              checked={it.checked}
              disabled={it.disabled}
              onChange={(e) => onChange(it.key, e.target.checked)}
            />
            <span>
              {it.label}
              {it.note && <span className="ml-2 text-sm text-slate-500">{it.note}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
