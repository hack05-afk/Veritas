import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/* The two families the token file names. Loading them here rather than from a
   stylesheet link means the CSS variables exist before the first paint. */
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veritas, a grounded finance assistant",
  description:
    "Ask a plain question about your ledger. Every number is computed in DuckDB, shown with the rows behind it, and marked with the readings that would change it.",
};

/**
 * Applied before the first paint so the page never flashes the wrong ground.
 * Wrapped in try/catch because storage throws in private windows.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("veritas-theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

/* The loaded families take the place of the names the tokens ask for, keeping
   the same fallback stacks so nothing changes if a face fails to arrive. */
const FONT_VARS = `:root{--font-sans:var(--font-sans-loaded),"Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,sans-serif;--font-mono:var(--font-mono-loaded),"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: FONT_VARS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
