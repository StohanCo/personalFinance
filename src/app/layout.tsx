import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinOps Tracker",
  description: "Financial operations tracker for NZ contractors",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
