/**
 * The body of a commit is wrapped at about 72 columns. In a narrow panel these breaks wrap a second
 * time and leave short ragged lines. This joins the lines of one paragraph. A blank line, a list
 * item and a trailer (`Key: value`) start a new line.
 */
export function unwrapLines(text: string): string {
	const out: string[] = [];
	for (const line of text.split("\n")) {
		const prev = out.at(-1);
		const starts = /^\s*([-*+]|\d+[.)])\s/.test(line) || /^[\w-]+: /.test(line);
		if (prev === undefined || prev.trim() === "" || line.trim() === "" || starts)
			out.push(line.trimEnd());
		else out[out.length - 1] = `${prev} ${line.trim()}`;
	}
	return out.join("\n");
}
