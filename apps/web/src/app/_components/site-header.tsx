import Link from "next/link";

const links = [
  { href: "/calendar", label: "Calendar" },
  { href: "/desk", label: "Creator mode" },
];

const pill =
  "inline-flex min-h-11 items-center rounded-pill px-[18px] font-semibold whitespace-nowrap no-underline hover:bg-ink hover:text-paper";

export function SiteHeader() {
  return (
    <div className="wrap sticky top-3 z-10 pt-3">
      <header className="flex items-center justify-between gap-4 rounded-pill border border-ink bg-paper py-1.5 pr-1.5 pl-[22px]">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-[1.375rem] font-extrabold tracking-[-0.02em] no-underline [font-stretch:92%] [font-variation-settings:'opsz'_48]"
        >
          MyBuster
        </Link>
        <nav aria-label="Main">
          <ul className="m-0 hidden list-none gap-1 p-0 min-[700px]:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={pill}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <details className="relative min-[700px]:hidden">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-pill bg-ink px-5 font-bold whitespace-nowrap text-paper [&::-webkit-details-marker]:hidden">
              Menu
            </summary>
            <div className="absolute top-[calc(100%+8px)] right-0 grid min-w-[200px] gap-0.5 rounded-3xl border border-ink bg-paper p-1.5">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={pill}>
                  {l.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>
      </header>
    </div>
  );
}
