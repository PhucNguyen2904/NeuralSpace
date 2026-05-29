"use client";

import { Inter } from "next/font/google";
import { motion } from "framer-motion";
import { ExternalLink, Monitor } from "lucide-react";
import { useRouter } from "next/navigation";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "700"] });
const featuresPrimary = ["GPU Ready", "AutoSave", "Collaborative"];
const featuresSecondary = ["Free Tier", "Google Drive", "External"];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, delay: i * 0.06, ease: "easeOut" },
  }),
};

export default function WorkspacePage(): JSX.Element {
  const router = useRouter();

  return (
    <div className={`${inter.className} -mx-4 -mt-6 md:-mx-6`} style={{ backgroundColor: "#f9fafb" }}>
      <div className="flex flex-col overflow-visible px-6 py-6 md:px-12">
        <div className="mx-auto w-full max-w-4xl">
          <motion.div custom={0} initial="hidden" animate="show" variants={fadeUp}>
            <span className="inline-flex items-center rounded-full border border-[#c7d2fe] bg-[#eef2ff] px-3 py-1 text-xs font-medium text-[#6366f1]">
              ◈ Select Environment
            </span>
          </motion.div>

          <motion.h1
            custom={1}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mt-3 text-[28px] font-bold tracking-tight text-[#111827]"
          >
            Choose Your Workspace
          </motion.h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="mt-1.5 text-[15px] leading-relaxed text-[#6b7280]"
          >
            Select an environment to continue. Launch Neural Space or open in Google Colab.
          </motion.p>
        </div>

        <div className="mx-auto mt-5 flex w-full max-w-[720px] flex-1 items-center overflow-visible">
          <motion.div custom={3} initial="hidden" animate="show" variants={fadeUp} className="grid w-full items-stretch gap-4 md:grid-cols-2">
            <motion.div
              whileHover={{ y: -2, boxShadow: "0 8px 28px rgba(99,102,241,0.14), 0 1px 4px rgba(0,0,0,0.06)" }}
              transition={{ duration: 0.2 }}
              className="relative flex h-full flex-col rounded-[14px] border-[1.5px] border-[#6366f1] bg-white p-5"
              style={{ boxShadow: "0 4px 24px rgba(99,102,241,0.1), 0 1px 4px rgba(0,0,0,0.06)" }}
            >
              <div className="absolute inset-y-0 left-0 w-1 rounded-l-[14px] bg-[#6366f1]" />
              <div className="mb-4 flex items-start justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef2ff] text-[#6366f1]">
                  <Monitor size={20} />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-1 text-xs font-medium text-[#15803d]">
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                  Live
                </span>
              </div>
              <h2 className="text-base font-semibold text-[#111827]">Neural Space</h2>
              <p className="mt-2 min-h-[60px] text-[13px] leading-[1.5] text-[#6b7280]">
                Full-featured cloud IDE with GPU access, pre-installed ML libraries, and real-time collaboration.
              </p>
              <div className="mt-3 flex min-h-8 flex-wrap gap-2">
                {featuresPrimary.map((feature) => (
                  <span key={feature} className="rounded-md bg-[#f3f4f6] px-2 py-[3px] text-[11px] text-[#374151]">
                    {feature}
                  </span>
                ))}
              </div>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => router.push("/workspaces")}
                className="mt-[14px] w-full rounded-lg bg-[#6366f1] px-4 py-[9px] text-sm font-medium text-white transition-all duration-150 hover:bg-[#4f46e5] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]"
              >
                Open Workspace →
              </button>
            </motion.div>

            <motion.div
              whileHover={{ y: -2, boxShadow: "0 6px 20px rgba(0,0,0,0.07)" }}
              transition={{ duration: 0.2 }}
              className="flex h-full flex-col rounded-[14px] border-[1.5px] border-[#e5e7eb] bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-colors hover:border-[#c7d2fe]"
            >
              <div className="mb-4 flex items-start justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#f3f4f6] text-[#6b7280]">
                  <ExternalLink size={20} />
                </span>
                <span className="inline-flex h-[26px] items-center rounded-full bg-transparent px-2 py-1 text-xs text-transparent">
                  Live
                </span>
              </div>
              <h2 className="text-base font-semibold text-[#111827]">Google Colab</h2>
              <p className="mt-2 min-h-[60px] text-[13px] leading-[1.5] text-[#6b7280]">
                Open this notebook in Google Colab. Requires Google account. Changes won't sync automatically.
              </p>
              <div className="mt-3 flex min-h-8 flex-wrap gap-2">
                {featuresSecondary.map((feature) => (
                  <span key={feature} className="rounded-md bg-[#f3f4f6] px-2 py-[3px] text-[11px] text-[#374151]">
                    {feature}
                  </span>
                ))}
              </div>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => window.open("https://colab.research.google.com/", "_blank", "noopener,noreferrer")}
                className="mt-[14px] w-full rounded-lg border-[1.5px] border-[#d1d5db] bg-white px-4 py-[9px] text-sm font-medium text-[#374151] transition-all duration-150 hover:border-[#6366f1] hover:text-[#6366f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]"
              >
                Open in Colab ↗
              </button>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <style jsx>{`
        .live-dot {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}
