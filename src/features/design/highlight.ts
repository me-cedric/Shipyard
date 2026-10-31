import type { Token } from "@/ui/molecules/code-editor";

const LIKEC4 = new Set(
	"specification model views view element tag relationship style include exclude autoLayout extend of this it title description technology link color shape icon dynamic deployment import from navigateTo metadata".split(
		" ",
	),
);
const DBML = new Set(
	"Table Ref Enum TableGroup Project Note indexes pk primary key not null unique increment default note as ref delete update cascade restrict".split(
		" ",
	),
);

/** Splits one line into words, strings, arrows and a trailing `//` comment, coloured by `words`. */
function tokens(line: string, words: Set<string>, arrows: RegExp): Token[] {
	const at = line.indexOf("//");
	const code = at >= 0 ? line.slice(0, at) : line;
	const out: Token[] = [];
	for (const part of code.split(/('[^']*'|"[^"]*"|`[^`]*`|[A-Za-z_][\w-]*|\s+)/)) {
		if (!part) continue;
		if (/^['"`]/.test(part)) out.push([part, "string"]);
		else if (words.has(part)) out.push([part, "keyword"]);
		else if (arrows.test(part)) out.push([part, "step"]);
		else if (part.startsWith("#")) out.push([part, "tag"]);
		else out.push([part, null]);
	}
	if (at >= 0) out.push([line.slice(at), "comment"]);
	return out;
}

/** LikeC4: keywords, strings, `->` relations, `#tags` and comments. */
export const likec4 = (line: string) => tokens(line, LIKEC4, /-+>|<-+/);

/** DBML: keywords, strings, `>` `<` `-` `<>` relations and comments. */
export const dbml = (line: string) => tokens(line, DBML, /^\s*(<>|[<>-])\s*$/);
