/**
 * The Date field for pickup history filters (SRS 18.8), shared by the admin
 * and parent pages. Use inside a plain GET form.
 */
import { useEffect, useRef } from "react";

import { inputClass } from "@/components/AuthCard";
import { localIsoDate } from "@/lib/parent";
import { useNow } from "@/lib/use-now";

/**
 * The date to show, with the browser's time zone in a hidden field: the
 * server cannot know it, and "14 October" must mean the viewer's day.
 * Without scripts the zone stays empty and the server uses UTC.
 */
export function DayField({ day, className = "" }: { day: string; className?: string }) {
  const zone = useRef<HTMLInputElement>(null);
  const now = useNow();

  useEffect(() => {
    if (zone.current) zone.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  return (
    <div className={className}>
      <label htmlFor="date" className="mb-1.5 block text-sm font-medium">
        Date
      </label>
      <input id="date" name="date" type="date" defaultValue={day} max={now ? localIsoDate(now) : undefined} className={inputClass} />
      <input ref={zone} type="hidden" name="tz" defaultValue="" />
    </div>
  );
}
