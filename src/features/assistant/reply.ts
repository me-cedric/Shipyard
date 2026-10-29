export type Part =
	| { kind: "text"; text: string }
	| { kind: "code"; lang: string; file: string; text: string };

/** Splits a reply into text and fenced code. The fence line reads: language, then the file name. */
export function parseReply(text: string): Part[] {
	const parts: Part[] = [];
	let at = 0;
	for (const m of text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)) {
		const before = text.slice(at, m.index).trim();
		if (before) parts.push({ kind: "text", text: before });
		const [lang = "", file = ""] = (m[1] ?? "").trim().split(/\s+/);
		parts.push({ kind: "code", lang, file, text: (m[2] ?? "").replace(/\n$/, "") });
		at = (m.index ?? 0) + m[0].length;
	}
	const rest = text.slice(at).trim();
	if (rest) parts.push({ kind: "text", text: rest });
	return parts;
}

/** The options of a reply: two bullets or more under a line that ends with a question mark. */
export function replyOptions(text: string): string[] {
	const lines = text.trimEnd().split("\n");
	const items: string[] = [];
	while (lines.length) {
		const m = /^\s*[-*]\s+(.+)$/.exec(lines[lines.length - 1] ?? "");
		if (!m?.[1]) break;
		items.unshift(m[1].trim());
		lines.pop();
	}
	return items.length >= 2 && (lines[lines.length - 1] ?? "").trimEnd().endsWith("?") ? items : [];
}
