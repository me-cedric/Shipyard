import { useI18n } from "@/lib/i18n";
import { usePrefs } from "./prefs";

/** A `YYYY-MM-DD` day in the date format of the person. An empty format follows the language; `short` gives day and month ("17 Nov"). */
export function formatDay(day: string, format: string, lang: string, short = false): string {
	const [y, m, d] = day.slice(0, 10).split("-");
	if (!(y && m && d)) return day;
	if (format === "iso") return `${y}-${m}-${d}`;
	if (format === "dmy") return `${d}/${m}/${y}`;
	if (format === "mdy") return `${m}/${d}/${y}`;
	return new Date(Date.UTC(+y, +m - 1, +d)).toLocaleDateString(
		dateLocale(lang),
		short
			? { day: "numeric", month: "short", timeZone: "UTC" }
			: { dateStyle: "medium", timeZone: "UTC" },
	);
}

/** The day formatter of the person. */
export function useDay() {
	const { lang } = useI18n();
	const { dateFormat } = usePrefs();
	return (day: string, short = false) => formatDay(day, dateFormat, lang, short);
}

/** The locale for a date: English gives the day first ("17 Nov"), as the Plan does. */
export const dateLocale = (lang: string) => (lang === "en" ? "en-GB" : lang);

/** The stamp formatter of the person: the day in their date format, then the time. `day` alone gives the day only. */
export function useStamp() {
	const { lang } = useI18n();
	const { dateFormat } = usePrefs();
	return (ms: number, day = false) => {
		const at = new Date(ms);
		if (!dateFormat)
			return new Intl.DateTimeFormat(
				dateLocale(lang),
				day ? { dateStyle: "medium" } : { dateStyle: "medium", timeStyle: "short" },
			).format(at);
		const p = (n: number) => String(n).padStart(2, "0");
		const local = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
		const text = formatDay(local, dateFormat, lang);
		return day
			? text
			: `${text} ${new Intl.DateTimeFormat(dateLocale(lang), { timeStyle: "short" }).format(at)}`;
	};
}
