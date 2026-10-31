import { useI18n } from "@/lib/i18n";
import { usePrefs } from "./prefs";

/** A `YYYY-MM-DD` day in the date format of the person. An empty format follows the language. */
export function formatDay(day: string, format: string, lang: string): string {
	const [y, m, d] = day.slice(0, 10).split("-");
	if (!(y && m && d)) return day;
	if (format === "iso") return `${y}-${m}-${d}`;
	if (format === "dmy") return `${d}/${m}/${y}`;
	if (format === "mdy") return `${m}/${d}/${y}`;
	return new Date(Date.UTC(+y, +m - 1, +d)).toLocaleDateString(lang, { timeZone: "UTC" });
}

/** The day formatter of the person. */
export function useDay() {
	const { lang } = useI18n();
	const { dateFormat } = usePrefs();
	return (day: string) => formatDay(day, dateFormat, lang);
}
