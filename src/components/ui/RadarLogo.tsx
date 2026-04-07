import { cn } from "@/lib/utils";

interface RadarLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showText?: boolean;
}

export function RadarLogo({ size = "md", className, showText = true }: RadarLogoProps) {
  const sizes = {
    sm: { svg: 24, text: "text-base" },
    md: { svg: 32, text: "text-xl" },
    lg: { svg: 48, text: "text-3xl" },
  };

  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Radar SVG mark */}
      <svg
        width={s.svg}
        height={s.svg}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Radar logo"
      >
        {/* Outer ring */}
        <circle cx="24" cy="24" r="22" stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.3" />
        {/* Middle ring */}
        <circle cx="24" cy="24" r="14" stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.5" />
        {/* Inner ring */}
        <circle cx="24" cy="24" r="6" stroke="#3B82F6" strokeWidth="1.5" strokeOpacity="0.8" />
        {/* Sweep line */}
        <line
          x1="24"
          y1="24"
          x2="24"
          y2="2"
          stroke="#3B82F6"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Sweep arc (partial) */}
        <path
          d="M24 2 A22 22 0 0 1 43.5 17"
          stroke="#3B82F6"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeOpacity="0.5"
          fill="none"
        />
        {/* Center dot */}
        <circle cx="24" cy="24" r="2.5" fill="#3B82F6" />
        {/* Blip */}
        <circle cx="30" cy="10" r="2" fill="#3B82F6" fillOpacity="0.9" />
        <circle cx="30" cy="10" r="4" fill="#3B82F6" fillOpacity="0.2" />
      </svg>

      {showText && (
        <span
          className={cn(
            "font-display font-700 tracking-tight text-text-primary",
            s.text
          )}
          style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          Radar
        </span>
      )}
    </div>
  );
}
