import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "NeuralSpace",
  description: "Cloud IDE platform",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg"
  }
};

const themeInitScript = `
(() => {
  try {
    const preference = window.localStorage.getItem("ui-theme") || "dark";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const useLight = preference === "light" || (preference === "system" && !systemDark);
    const root = document.documentElement;
    root.classList.toggle("light", useLight);
    root.classList.toggle("theme-dark", !useLight);
  } catch {
    document.documentElement.classList.add("theme-dark");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="theme-dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a href="#main-content" className="absolute top-4 left-4 z-[120] -translate-y-[150%] rounded-md bg-bg-surface px-3 py-2 text-sm text-text-primary shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-brand-500">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
