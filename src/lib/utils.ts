import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The names of the tokens (`tokens.css`). Without them the merge reads a type size as a colour and
// drops the text colour, and it keeps two heights or two radii together.
const twMerge = extendTailwindMerge({
	extend: {
		theme: { radius: ["field"] },
		classGroups: {
			"font-size": [{ text: ["ui", "11", "12", "13", "14", "15", "16", "17", "20", "30", "44"] }],
			"min-h": [{ "min-h": ["control", "row"] }],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** A time in ms for a person: "850 ms", "12.4 s" (FR "12,4 s"), "1 min 15 s". The units are the same in both languages. */
export function formatDuration(ms: number, lang = "en") {
	if (ms < 1000) return `${Math.round(ms)} ms`;
	if (ms < 60_000) {
		const one = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
		return `${new Intl.NumberFormat(lang, one).format(ms / 1000)} s`;
	}
	const s = Math.round(ms / 1000);
	return `${Math.floor(s / 60)} min ${s % 60} s`;
}
