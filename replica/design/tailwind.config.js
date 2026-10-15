/** @type {import('tailwindcss').Config} */
/* EchoPrism v2.0 Tailwind Config - Maps design tokens to Tailwind theme */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "media", // respects prefers-color-scheme
  theme: {
    extend: {
      colors: {
        // Core surfaces
        bg: "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        surface: "var(--surface)",
        "surface-hover": "var(--surface-hover)",

        // Borders
        border: "var(--border)",
        "border-input": "var(--border-input)",

        // Text
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-subtle": "var(--text-subtle)",

        // Accent (Unified Stream - Emerald)
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-glow": "var(--accent-glow)",
        "on-accent": "var(--on-accent)",

        // Semantic
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        success: "var(--success)",
        "success-soft": "var(--success-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",

        // Stream Colors (Convergence)
        "stream-audio": "var(--stream-audio)",
        "stream-audio-soft": "var(--stream-audio-soft)",
        "stream-video": "var(--stream-video)",
        "stream-video-soft": "var(--stream-video-soft)",
        "stream-unified": "var(--stream-unified)",

        // Chromatic Aberration
        "ca-warm": "var(--ca-warm)",
        "ca-cool": "var(--ca-cool)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: ["var(--type-xs-size)", { lineHeight: "var(--type-xs-line)", fontWeight: "var(--type-xs-weight)" }],
        sm: ["var(--type-sm-size)", { lineHeight: "var(--type-sm-line)", fontWeight: "var(--type-sm-weight)" }],
        base: ["var(--type-base-size)", { lineHeight: "var(--type-base-line)", fontWeight: "var(--type-base-weight)" }],
        lg: ["var(--type-lg-size)", { lineHeight: "var(--type-lg-line)", fontWeight: "var(--type-lg-weight)" }],
        xl: ["var(--type-xl-size)", { lineHeight: "var(--type-xl-line)", fontWeight: "var(--type-xl-weight)" }],
        display: ["var(--type-display-size)", { lineHeight: "var(--type-display-line)", fontWeight: "var(--type-display-weight)" }],
      },
      spacing: {
        0: "var(--space-0)",
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        7: "var(--space-7)",
        8: "var(--space-8)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        "unified-glow": "var(--shadow-unified-glow)",
        "converge-glow": "var(--shadow-converge-glow)",
      },
      transitionDuration: {
        instant: "var(--motion-instant)",
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
        converge: "var(--motion-converge)",
        emerge: "var(--motion-emerge)",
      },
      transitionTimingFunction: {
        ease: "var(--motion-ease)",
        spring: "var(--motion-spring)",
      },
      keyframes: {
        "converge-audio": {
          from: { opacity: "0", "stroke-dashoffset": "100" },
          to: { opacity: "1", "stroke-dashoffset": "0" },
        },
        "converge-video": {
          from: { opacity: "0", "stroke-dashoffset": "100" },
          to: { opacity: "1", "stroke-dashoffset": "0" },
        },
        "emerge-unified": {
          from: { opacity: "0", "stroke-dashoffset": "50" },
          to: { opacity: "1", "stroke-dashoffset": "0" },
        },
        "pulse-unified": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "converge-audio": "converge-audio var(--motion-converge) var(--motion-spring)",
        "converge-video": "converge-video var(--motion-converge) var(--motion-spring)",
        "emerge-unified": "emerge-unified var(--motion-emerge) var(--motion-spring)",
        "pulse-unified": "pulse-unified 800ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};