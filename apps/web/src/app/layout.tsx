import type { Metadata } from "next";
import { Azeret_Mono, Bricolage_Grotesque, Source_Serif_4 } from "next/font/google";
import { Providers } from "./providers";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});
const azeret = Azeret_Mono({ variable: "--font-azeret", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyBuster",
  description: "Find the health myth. Get the receipts. Make the debunk.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${bricolage.variable} ${sourceSerif.variable} ${azeret.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <SiteHeader />
        <div className="flex-1">
          <Providers>{children}</Providers>
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
