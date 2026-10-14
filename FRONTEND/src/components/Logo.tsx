type LogoProps = {
  /** "light" for navy backgrounds (sidebar), "dark" for white ones (login). */
  tone?: "light" | "dark";
  /** Icon height in pixels; the wordmark scales with it. */
  size?: number;
  /** Show the "Pikva" wordmark next to the shield. */
  withName?: boolean;
};

/** The Pikva shield mark, optionally with its wordmark. */
export function Logo({ tone = "dark", size = 32, withName = true }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <ShieldMark size={size} />
      {withName && (
        <span
          className={`font-semibold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}
          style={{ fontSize: size * 0.75 }}
        >
          Pikva
        </span>
      )}
    </span>
  );
}

function ShieldMark({ size }: { size: number }) {
  return (
    <svg width={size * 0.86} height={size} viewBox="0 0 30 35" aria-hidden="true">
      <path
        d="M15 1.5 27.5 6v10.2c0 8.1-5.2 14.6-12.5 17.3C7.7 30.8 2.5 24.3 2.5 16.2V6L15 1.5Z"
        fill="#1556e0"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M15 7.5 22.5 10.3v6.2c0 4.9-3.1 8.8-7.5 10.5-4.4-1.7-7.5-5.6-7.5-10.5v-6.2L15 7.5Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
