import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";

const wordChar = (c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);

/** `needle` is in `text` as a whole word: no letter and no digit touches it. */
function hasWord(text: string, needle: string): boolean {
	for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1))
		if (!(wordChar(text[at - 1]) || wordChar(text[at + needle.length]))) return true;
	return false;
}

/**
 * The feature of a branch name or of a commit message.
 * shortcut: it reads the ticket key or the pull request number in the text (`feat/demo/pr-142`,
 * `fix: x (142)`, `feat/acme-2-login`); use a link from the backend when a branch carries its feature.
 */
export function featureOf(text: string, features: Feature[]): Feature | undefined {
	const low = text.toLowerCase();
	return features.find((f) => {
		const key = f.ticket?.slice("wi:".length).toLowerCase();
		const pull = f.pr?.split(":").at(-1);
		return (
			(!!key && hasWord(low, key)) ||
			(!!pull && (hasWord(low, `pr-${pull}`) || hasWord(low, `#${pull}`)))
		);
	});
}
