type LogoProps = {
  /** "light" for navy backgrounds (sidebar), "dark" for white ones (login). */
  tone?: "light" | "dark";
  /** Icon height in pixels; the wordmark scales with it. */
  size?: number;
  /** Show the "Pikva" wordmark next to the shield. */
  withName?: boolean;
};

/**
 * Wordmark size (0.75 of the icon) for each icon size in use, as classes:
 * the Content Security Policy blocks inline style attributes.
 */
const WORDMARK_SIZE: Record<number, string> = {
  26: "text-[19.5px]",
  30: "text-[22.5px]",
  32: "text-[24px]",
  40: "text-[30px]",
  48: "text-[36px]",
};

/** The Pikva shield mark, optionally with its wordmark. */
export function Logo({ tone = "dark", size = 32, withName = true }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <ShieldMark size={size} />
      {withName && (
        <span
          className={`font-semibold tracking-tight ${WORDMARK_SIZE[size] ?? "text-2xl"} ${
            tone === "light" ? "text-white" : "text-ink"
          }`}
        >
          Pikva
        </span>
      )}
    </span>
  );
}

/** Cut from public/images/LOGO-PIKVA.jpg.jpeg, transparent outside the shield. */
function ShieldMark({ size }: { size: number }) {
  return (
    <img
      src="/images/pikva-mark.png"
      alt=""
      aria-hidden="true"
      width={Math.round(size * 0.868)}
      height={size}
      className="shrink-0"
    />
  );
}
