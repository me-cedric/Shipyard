// Language packs (spec `languages`, ADR 0021). A pack is a flat map of message keys to text.
// The English catalogue is the key list: the view checks a pack against it, and each key that the
// pack does not translate shows in English.
import type { ActionKind, LanguagePack } from "@/lib/ipc/bindings";
import { en, type Messages } from "./en";
import { actionLabels, errorMessages, type Known } from "./errors";

export type Flat = Record<string, string>;

/** The leaves of a tree as `a.b.c` keys. */
export function flatten(tree: object, prefix = ""): Flat {
	const out: Flat = {};
	for (const [k, v] of Object.entries(tree)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (typeof v === "string") out[key] = v;
		else if (v && typeof v === "object") Object.assign(out, flatten(v, key));
	}
	return out;
}

/** Every key that a pack can translate, with its English text. Errors and actions have a prefix. */
export const baseMessages = (): Flat => ({
	...flatten(en),
	...flatten(errorMessages.en, "error"),
	...flatten(actionLabels.en, "action"),
});

const slots = (v: string) => (v.match(/\{\w+\}/g) ?? []).sort().join(" ");

/**
 * The faults of the messages of a pack, as `<key>: <reason>`: a key that is not in the English
 * base, or a text with other placeholders. A key that is missing is not a fault: it shows in English.
 */
export function packFaults(messages: Flat): string[] {
	const base = baseMessages();
	return Object.entries(messages).flatMap(([k, v]) =>
		!Object.hasOwn(base, k)
			? [`${k}: not a message key`]
			: slots(v) !== slots(base[k] as string)
				? [`${k}: use the placeholders ${slots(base[k] as string) || "none"}`]
				: [],
	);
}

/** The keys of the English base that the pack does not translate. */
export const untranslated = (messages: Flat) =>
	Object.keys(baseMessages()).filter((k) => !Object.hasOwn(messages, k));

/** The marker of a text that a pack does not translate, when the person asks to see them. */
export const mark = (text: string) => `⟦${text}⟧`;

function fill<T extends object>(tree: T, messages: Flat, marked: boolean, prefix: string): T {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(tree)) {
		const key = prefix ? `${prefix}.${k}` : k;
		// A text with other placeholders than English shows in English: a plugin pack gets no key check.
		const own = typeof v === "string" && Object.hasOwn(messages, key) ? messages[key] : undefined;
		out[k] =
			typeof v === "string"
				? own !== undefined && slots(own) === slots(v)
					? own
					: marked
						? mark(v)
						: v
				: fill(v as object, messages, marked, key);
	}
	return out as T;
}

/** The catalogue, error sentences and action labels of a pack over the English base. */
export function applyPack(pack: LanguagePack, marked: boolean) {
	return {
		t: fill(en, pack.messages, marked, "") as Messages,
		errors: fill(errorMessages.en, pack.messages, marked, "error") as Record<Known, string>,
		actions: fill(actionLabels.en, pack.messages, marked, "action") as Record<ActionKind, string>,
	};
}

/** The English base as a pack file: the start of a new language. */
export const starterPack = (name: string): LanguagePack => ({
	shipyardLanguage: 1,
	code: "xx",
	name,
	messages: baseMessages(),
});
