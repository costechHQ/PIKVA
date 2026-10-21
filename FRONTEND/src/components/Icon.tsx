import type { IconName } from "@/lib/navigation";

type ShellIcon = IconName | "menu" | "close" | "logout" | "school" | "back" | "volume" | "mute";

// 24x24 outline paths in the style of the design's icons.
const PATHS: Record<ShellIcon, string> = {
  dashboard: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z",
  gate: "M12 3 4 6v6c0 4.4 3.4 8.1 8 9 4.6-.9 8-4.6 8-9V6l-8-3Zm-3.5 9 2.5 2.5 4.5-5",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6",
  pupils: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0",
  history: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  audit: "M8 4h10a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7l3-3Zm0 0v3H5M9 11h6M9 15h6",
  alerts:"M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  pickup:"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 10-4.5M15 17h6M18 14l3 3-3 3",
  approvals:"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10v-1a6 6 0 0 1 9-5.2M15 18l2 2 4-4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 18l-6-6 6-6",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10",
  volume: "M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  mute: "M11 5 6 9H3v6h3l5 4V5ZM16 9l5 6M21 9l-5 6",
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
