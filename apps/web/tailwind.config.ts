import type { Config } from "tailwindcss";

/**
 * Tailwind is only a delivery mechanism here. The scale, the palette and the
 * rhythm live in packages/ui/tokens.css; this file exposes them as utilities so
 * a component can say text-sm rather than text-[length:var(--text-sm)].
 */
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "2xs": ["var(--text-2xs)", { lineHeight: "1.4" }],
        xs: ["var(--text-xs)", { lineHeight: "1.45" }],
        sm: ["var(--text-sm)", { lineHeight: "1.5" }],
        base: ["var(--text-base)", { lineHeight: "1.55" }],
        md: ["var(--text-md)", { lineHeight: "1.55" }],
        lg: ["var(--text-lg)", { lineHeight: "1.4" }],
        xl: ["var(--text-xl)", { lineHeight: "1.3" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "1.2", letterSpacing: "var(--tracking-tight)" }],
        display: ["var(--text-display)", { lineHeight: "1.04", letterSpacing: "var(--tracking-tight)" }],
        answer: ["var(--text-answer)", { lineHeight: "1.05", letterSpacing: "var(--tracking-tight)" }],
      },
      colors: {
        paper: "hsl(var(--paper))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          sunken: "hsl(var(--surface-sunken))",
          raised: "hsl(var(--surface-raised))",
        },
        ink: {
          DEFAULT: "hsl(var(--ink))",
          2: "hsl(var(--ink-2))",
          3: "hsl(var(--ink-3))",
          4: "hsl(var(--ink-4))",
        },
        rule: {
          DEFAULT: "hsl(var(--rule))",
          strong: "hsl(var(--rule-strong))",
          faint: "hsl(var(--rule-faint))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          soft: "hsl(var(--accent-soft))",
          line: "hsl(var(--accent-line))",
        },
        stable: { DEFAULT: "hsl(var(--stable))", soft: "hsl(var(--stable-soft))" },
        sensitive: { DEFAULT: "hsl(var(--sensitive))", soft: "hsl(var(--sensitive-soft))" },
        fragile: { DEFAULT: "hsl(var(--fragile))", soft: "hsl(var(--fragile-soft))" },

        // Kept so any component not yet rewritten still resolves.
        background: "hsl(var(--paper))",
        foreground: "hsl(var(--ink))",
        card: "hsl(var(--surface))",
        border: "hsl(var(--rule))",
        brand: "hsl(var(--accent))",
        "brand-soft": "hsl(var(--accent-soft))",
        "brand-text": "hsl(var(--accent))",
        muted: "hsl(var(--ink-3))",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
      },
      letterSpacing: {
        tight: "var(--tracking-tight)",
        snug: "var(--tracking-snug)",
        label: "var(--tracking-label)",
      },
      transitionTimingFunction: {
        DEFAULT: "var(--ease)",
      },
    },
  },
  plugins: [],
};

export default config;
