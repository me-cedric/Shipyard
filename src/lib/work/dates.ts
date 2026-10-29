/** Calendar days as `YYYY-MM-DD` text. The plan stores days, never a time of day. */
const DAY = 86_400_000;

const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(utc(s));

export const addDays = (day: string, n: number) =>
	new Date(utc(day) + n * DAY).toISOString().slice(0, 10);

/** Whole days from `a` to `b`. */
export const diffDays = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);

/** 1 is Monday, 7 is Sunday, as in the calendar file. */
export const isoWeekday = (day: string) => new Date(utc(day)).getUTCDay() || 7;

export const addMonths = (month: string, n: number) => {
	const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
	return d.toISOString().slice(0, 7);
};

/** `2026-11`, in the language of the person. */
export const monthLabel = (month: string, lang: string) =>
	new Date(`${month}-01T00:00:00Z`).toLocaleDateString(lang, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});

/**
 * Reads a duration as minutes: `90`, `90m`, `2h`, `1h30`, `1.5h`. A bare number is minutes.
 * Returns null for text that is no duration.
 */
export function parseDuration(text: string): number | null {
	const s = text.trim().toLowerCase().replace(",", ".");
	let m = /^(\d+(?:\.\d+)?)\s*h(?:\s*(\d{1,2}))?$/.exec(s);
	if (m) return Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0));
	m = /^(\d+)\s*m?$/.exec(s);
	return m ? Number(m[1]) : null;
}

/** `150` is `2h30`. */
export const formatMinutes = (minutes: number) => {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
};

/** A sheet name as a slug: lower case letters, digits and `-`. */
export const slugify = (name: string) =>
	name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** A figure with at most two decimals, or a dash when the seal or a missing rate hides it. */
export const figure = (n: number | null | undefined, lang: string) =>
	n == null ? "—" : n.toLocaleString(lang, { maximumFractionDigits: 2 });

/** An amount in the currency of the sheet. A code that Intl does not know shows as a plain figure. */
export function money(n: number | null | undefined, currency: string, lang: string) {
	if (n == null) return "—";
	try {
		return n.toLocaleString(lang, { style: "currency", currency, maximumFractionDigits: 0 });
	} catch {
		return `${figure(n, lang)} ${currency}`;
	}
}
