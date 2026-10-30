/**
 * A markdown document as form parts: the title, status and people lines and the `## ` sections.
 * Each setter changes only the bytes of its own part, so a part that the form does not know stays.
 */

export type FieldKind = "title" | "status" | "people";

const FIELD: Record<FieldKind, RegExp> = {
	title: /^(# )(.*)$/,
	status: /^(status:[ \t]*)(.*)$/i,
	people: /^((?:decision-makers|deciders|owners?):[ \t]*)(.*)$/i,
};

/** The lines of a text, each with a flag for fenced code. */
function scan(text: string) {
	let fence = false;
	return text.split("\n").map((line) => {
		const mark = /^\s*(```|~~~)/.test(line);
		const code = fence || mark;
		if (mark) fence = !fence;
		return { line, code };
	});
}

/** The first line of a field outside fenced code, or null. */
export function field(text: string, kind: FieldKind): { index: number; value: string } | null {
	const lines = scan(text);
	for (const [index, l] of lines.entries()) {
		const m = l.code ? null : FIELD[kind].exec(l.line);
		if (m) return { index, value: m[2] ?? "" };
	}
	return null;
}

export function setField(text: string, kind: FieldKind, value: string): string {
	const f = field(text, kind);
	if (!f) return text;
	const lines = text.split("\n");
	const prefix = FIELD[kind].exec(lines[f.index] ?? "")?.[1] ?? "";
	lines[f.index] = prefix + value.replace(/\n/g, " ");
	return lines.join("\n");
}

/** The text cut before each `## ` heading outside fenced code. The first chunk is the head. */
function chunks(text: string): string[] {
	const cuts = [0];
	let at = 0;
	for (const l of scan(text)) {
		if (!l.code && l.line.startsWith("## ")) cuts.push(at);
		at += l.line.length + 1;
	}
	cuts.push(text.length);
	return cuts.slice(0, -1).map((c, i) => text.slice(c, cuts[i + 1]));
}

/** The `## ` sections: the heading text and the body below it. */
export function sections(text: string): { heading: string; body: string }[] {
	return chunks(text)
		.slice(1)
		.map((c) => {
			const nl = c.indexOf("\n");
			return nl < 0
				? { heading: c.slice(3), body: "" }
				: { heading: c.slice(3, nl), body: c.slice(nl + 1) };
		});
}

export function setSection(text: string, index: number, body: string): string {
	const all = chunks(text);
	const c = all[index + 1];
	if (c === undefined) return text;
	const nl = c.indexOf("\n");
	const heading = nl < 0 ? c : c.slice(0, nl);
	all[index + 1] = heading + (nl >= 0 || body ? "\n" : "") + body;
	return all.join("");
}

/** A body as the blank lines before it, the text and the blank lines after it. */
export function trimBody(body: string) {
	const lead = /^\s*\n/.exec(body)?.[0] ?? "";
	const rest = body.slice(lead.length);
	const trail = /\n\s*$/.exec(rest)?.[0] ?? "";
	return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

/** The body again from its parts and a new text. An empty section gets a line end. */
export function joinBody(parts: ReturnType<typeof trimBody>, core: string) {
	const trail = parts.trail || (parts.core === "" && core !== "" ? "\n" : "");
	return parts.lead + core + trail;
}
