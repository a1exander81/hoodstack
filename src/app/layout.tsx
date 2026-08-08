import type { Metadata } from "next";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chipstack",
  description: "Play now. Cash out anytime.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-base text-text-primary">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
