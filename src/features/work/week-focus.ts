import { addDays, isoWeekday } from "@/lib/work";

/** The Monday of the week that holds `day`. */
export const weekStart = (day: string) => addDays(day, 1 - isoWeekday(day));

/** The form name that opens a member on the week of a plan sheet: `member:` plus this. */
export const memberWeek = (handle: string, week: string, slug: string) =>
	`${handle}|${week}|${slug}`;

/** Splits what follows `member:`. A plain handle has no week. The handle may hold a `|`. */
export function parseMemberWeek(rest: string): { handle: string; week?: string; slug?: string } {
	const b = rest.lastIndexOf("|");
	const a = rest.lastIndexOf("|", b - 1);
	if (b < 0 || a < 0) return { handle: rest };
	return { handle: rest.slice(0, a), week: rest.slice(a + 1, b), slug: rest.slice(b + 1) };
}
