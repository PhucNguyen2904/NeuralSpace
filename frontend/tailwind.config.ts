import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-space-mono)", "monospace"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"]
      },
      colors: {
        bg: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          overlay: "var(--bg-overlay)"
        },
        border: { DEFAULT: "var(--border)", focus: "var(--border-focus)" },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          code: "var(--text-code)"
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          glow: "var(--accent-glow)"
        },
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        info: "var(--info)",
        status: {
          provisioning: "var(--status-provisioning)",
          running: "var(--status-running)",
          stopping: "var(--status-stopping)",
          stopped: "var(--status-stopped)",
          error: "var(--status-error)"
        }
      },
      spacing: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "20px", 6: "24px", 8: "32px", 12: "48px", 16: "64px" },
      fontSize: {
        xs: ["12px", "16px"],
        sm: ["13px", "18px"],
        base: ["14px", "20px"],
        md: ["16px", "24px"],
        lg: ["20px", "28px"],
        xl: ["24px", "32px"],
        "2xl": ["32px", "40px"]
      },
      boxShadow: { glow: "0 0 0 4px var(--accent-glow)", panel: "0 10px 30px rgba(0, 0, 0, 0.35)" },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        pulseDot: { "0%, 100%": { opacity: "0.5", transform: "scale(1)" }, "50%": { opacity: "1", transform: "scale(1.15)" } }
      },
      animation: { shimmer: "shimmer 2s linear infinite", pulseDot: "pulseDot 1.5s ease-in-out infinite" }
    }
  },
  plugins: []
};

export default config;
