/** The share of a budget where the alert shows when the project sets none, in percent (`BUDGET_ALERT`). */
export const WARN_AT = 80;

/** A percent in the form of the language: "80%" in English, "80 %" in French. */
export const percent = (n: number, lang: string) =>
	new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 }).format(n / 100);
