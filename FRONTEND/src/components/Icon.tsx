import type { IconName } from "@/lib/navigation";

type ShellIcon = IconName | "menu" | "close" | "logout" | "school";

// 24x24 outline paths in the style of the design's icons.
const PATHS: Record<ShellIcon, string> = {
  dashboard: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  gate: "M12 3 4 6v6c0 4.4 3.4 8.1 8 9 4.6-.9 8-4.6 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10",
  school: "M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5M12 9.5v.01",
};

/** Small outline icon; decorative, so hidden from screen readers. */
export function Icon({ name, className = "h-5 w-5" }: { name: ShellIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
