import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "NeuralSpace",
  description: "Cloud IDE platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-md focus:bg-bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-text-primary">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
