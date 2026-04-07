import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        radar: {
          base: "#0F1623",
          surface: "#141C2E",
          "surface-alt": "#1A2338",
          elevated: "#1F2A40",
          border: "#263047",
          accent: "#3B82F6",
          "accent-hover": "#2563EB",
        },
        text: {
          primary: "#F0F4FF",
          secondary: "#8B9ABF",
          muted: "#4A5878",
        },
      },
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(59,130,246,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.03) 1px,transparent 1px)",
      },
      backgroundSize: {
        "grid-40": "40px 40px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "radar-pulse": {
          "0%,100%": { transform: "scale(0.95)", opacity: "1" },
          "50%": { transform: "scale(1.05)", opacity: "0.7" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out forwards",
        "radar-pulse": "radar-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
