import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TBX",
  description: "Ask your ledger. Get the truth.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
