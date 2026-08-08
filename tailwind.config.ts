import type { Config } from "tailwindcss";

// Color values mirror context/ui-context.md — keep these two files in sync.
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "bg-base": "#0B0E11",
        "bg-surface": "#161A20",
        "text-primary": "#F2F3F5",
        "text-muted": "#8B919A",
        "accent-primary": "#22C55E",
        "border-default": "#262B33",
      },
    },
  },
  plugins: [],
} satisfies Config;
