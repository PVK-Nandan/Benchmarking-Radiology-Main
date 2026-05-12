import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "MONARCS Radiology Report Comparison",
  description: "Radiology AI model benchmarking with report-to-report comparison."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
