type Announcement = { enabled: boolean; startsAt?: string; expiresAt?: string; [key: string]: unknown };
const formatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit", hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
});
const localNow = (date: Date) => formatter.format(date).replace(" ", "T");
/** Resolve Denver wall time to an instant, including DST. Ambiguous fall times use the earlier occurrence. */
export function denverInstant(value: string): number {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
  const utc=Date.parse(value+"Z");
  if(!Number.isFinite(utc))return NaN;
  const matches=[6,7].map(hours=>utc+hours*3600000).filter(time=>localNow(new Date(time)).slice(0,16)===value);
  return matches.length ? Math.min(...matches) : NaN;
}
export function announcementStatus(item: Announcement, now = new Date()) {
  if (!item.enabled) return "Off";
  const current = now.getTime();
  if ((item.startsAt && !Number.isFinite(denverInstant(item.startsAt))) || (item.expiresAt && !Number.isFinite(denverInstant(item.expiresAt))))return "Off";
  if (item.expiresAt && current >= denverInstant(item.expiresAt)) return "Expired";
  if (item.startsAt && current < denverInstant(item.startsAt)) return "Scheduled";
  return "Live";
}
export function activeAnnouncements(items: Announcement[], now = new Date()) {
  return items.filter(item=>announcementStatus(item,now)==="Live");
}
