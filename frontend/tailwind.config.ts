import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--color-bg-base)",
          surface: "var(--color-bg-surface)",
          elevated: "var(--color-bg-elevated)",
          sunken: "var(--color-bg-sunken)"
        },
        border: {
          DEFAULT: "var(--color-border-default)",
          strong: "var(--color-border-strong)"
        },
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)"
        },
        brand: {
          50: "var(--color-brand-50)",
          100: "#E0E7FF",
          500: "var(--color-brand-500)",
          600: "var(--color-brand-600)"
        },
        success: {
          50: "var(--color-success-50)",
          500: "var(--color-success-500)"
        },
        warning: {
          50: "var(--color-warning-50)",
          500: "var(--color-warning-500)"
        },
        error: {
          50: "var(--color-error-50)",
          500: "var(--color-error-500)"
        },
        info: {
          500: "var(--color-info-500)"
        }
      },
      fontSize: {
        xs: ["11px", { lineHeight: "1.5" }],
        sm: ["13px", { lineHeight: "1.5" }],
        base: ["14px", { lineHeight: "1.6" }],
        md: ["15px", { lineHeight: "1.6" }],
        lg: ["17px", { lineHeight: "1.5" }],
        xl: ["20px", { lineHeight: "1.4" }],
        "2xl": ["24px", { lineHeight: "1.3" }],
        "3xl": ["30px", { lineHeight: "1.2" }]
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        full: "var(--radius-full)"
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        brand: "var(--shadow-brand)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        }
      },
      animation: {
        fadeIn: "fadeIn 0.2s ease-out",
        slideUp: "slideUp 0.3s ease-out",
        scaleIn: "scaleIn 0.15s ease-out"
      },
      backgroundImage: {
        "brand-gradient": "var(--color-brand-gradient)"
      }
    }
  },
  plugins: []
};

export default config;
