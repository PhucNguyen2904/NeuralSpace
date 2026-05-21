import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
export const metadata: Metadata = { title: "Cloud IDE Platform", description: "Cloud-hosted notebook workspaces for ML and data teams" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" className="dark"><body className={`${inter.variable} ${spaceMono.variable} ${jetbrains.variable}`}>{children}<Toaster /></body></html>; }
