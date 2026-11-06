"use client";

export type ChecklistItem = { key: string; label: string; checked: boolean; disabled?: boolean; note?: string };

// Controlled: the parent owns the booleans.
export function Checklist({ items, onChange }: { items: ChecklistItem[]; onChange: (key: string, checked: boolean) => void }) {
  return (
    <ul className="m-0 grid list-none border-t border-rule p-0">
      {items.map((it) => (
        <li key={it.key} className="border-b border-rule">
          <label
            className={`flex min-h-11 items-start gap-3 py-3 text-lg font-semibold ${it.disabled ? "opacity-60" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              name={it.key}
              className="mt-1 h-5 w-5 shrink-0 accent-ink"
              checked={it.checked}
              disabled={it.disabled}
              onChange={(e) => onChange(it.key, e.target.checked)}
            />
            <span>
              {it.label}
              {it.note && <span className="ml-2 text-sm font-medium text-ink-2">{it.note}</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
