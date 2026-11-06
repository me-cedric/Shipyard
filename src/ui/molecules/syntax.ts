/** One coloured piece of a line. `null` is plain text. */
export type Token = [
	text: string,
	tone: "keyword" | "step" | "tag" | "comment" | "string" | "ref" | null,
];

export type Highlighter = (line: string) => Token[];

const KEYWORD =
	/^(\s*)(Feature|Background|Scenario Outline|Scenario Template|Scenario|Example|Examples|Rule)(:)/;
const STEP = /^(\s*)(Given|When|Then|And|But|\*)(\s)/;
const INLINE = /("[^"]*"|<[^>]+>|\b[a-z]+:[\w-]+(?:#[\w-]+)?|\|)/g;

/** Splits one Gherkin line into coloured pieces: keywords, steps, tags, comments, strings and refs. */
export function gherkin(line: string): Token[] {
	if (/^\s*#/.test(line)) return [[line, "comment"]];
	if (/^\s*@/.test(line)) return [[line, "tag"]];
	const out: Token[] = [];
	let rest = line;
	const head = KEYWORD.exec(rest) ?? STEP.exec(rest);
	if (head) {
		out.push([head[1] ?? "", null], [`${head[2]}`, KEYWORD.test(rest) ? "keyword" : "step"]);
		rest = rest.slice((head[1] ?? "").length + (head[2] ?? "").length);
	}
	for (const part of rest.split(INLINE)) {
		if (!part) continue;
		if (part === "|") out.push([part, "comment"]);
		else if (part.startsWith('"') || part.startsWith("<")) out.push([part, "string"]);
		else if (/^[a-z]+:[\w-]+/.test(part)) out.push([part, "ref"]);
		else out.push([part, null]);
	}
	return out;
}

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

const MERMAID = new Set(
	"graph flowchart sequenceDiagram classDiagram stateDiagram stateDiagram-v2 erDiagram journey gantt pie mindmap timeline gitGraph quadrantChart requirementDiagram C4Context subgraph end direction TB TD BT RL LR participant actor note over left right of loop alt else opt par and critical break rect activate deactivate autonumber state class classDef style linkStyle click section title dateFormat as".split(
		" ",
	),
);

/** Mermaid: diagram and block keywords, `-->` style arrows, strings, `%%` comments. */
export const mermaid: Highlighter = (line) => {
	const at = line.indexOf("%%");
	const body = at >= 0 ? line.slice(0, at) : line;
	const out: Token[] = [];
	for (const part of body.split(/("[^"]*"|\[\*\]|[A-Za-z_]\w*(?:-\w+)*|[-=.ox<>|]{2,}|\s+)/)) {
		if (!part) continue;
		if (part.startsWith('"')) out.push([part, "string"]);
		else if (MERMAID.has(part)) out.push([part, "keyword"]);
		else if (/^[-=.ox<>|]{2,}$/.test(part) && /[-=.]/.test(part)) out.push([part, "step"]);
		else if (part === "[*]") out.push([part, "tag"]);
		else out.push([part, null]);
	}
	if (at >= 0) out.push([line.slice(at), "comment"]);
	return out;
};

const MD_INLINE = /(`[^`]+`|\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*|\b[a-z]+:[\w-]+(?:#[\w-]+)?)/g;

/** Markdown: headings, quotes, fences, list markers, inline code, links, bold and refs. shortcut: line by line, a fenced block body stays plain. */
export const markdown: Highlighter = (line) => {
	if (/^\s*#{1,6}\s/.test(line)) return [[line, "keyword"]];
	if (/^\s*>/.test(line)) return [[line, "comment"]];
	if (/^\s*(```|~~~)/.test(line)) return [[line, "tag"]];
	const out: Token[] = [];
	const list = /^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s+)?/.exec(line);
	let rest = line;
	if (list) {
		out.push([list[1] ?? "", null], [`${list[2]}${list[3]}${list[4] ?? ""}`, "step"]);
		rest = line.slice(list[0].length);
	}
	for (const part of rest.split(MD_INLINE)) {
		if (!part) continue;
		if (part.startsWith("`")) out.push([part, "string"]);
		else if (part.startsWith("[") || /^[a-z]+:[\w-]+/.test(part)) out.push([part, "ref"]);
		else if (part.startsWith("**")) out.push([part, "keyword"]);
		else out.push([part, null]);
	}
	return out;
};

// One pass per line: a comment, a string, a number or a keyword.
const TOKEN =
	/(\/\/.*|#.*|--.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|import|export|from|class|fn|pub|use|struct|impl|enum|async|await|def|type|interface|true|false|null|None|self|package|func|public|private|static|void|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b/g;
const KIND: Token[1][] = [null, "comment", "string", "step", "keyword"];

/** Code of the C family, scripts, config and data files. shortcut: one regex, no multi-line comment or string, add a parser when needed. */
export const code: Highlighter = (line) => {
	const out: Token[] = [];
	let at = 0;
	for (const m of line.matchAll(TOKEN)) {
		if (m.index > at) out.push([line.slice(at, m.index), null]);
		const kind = [1, 2, 3, 4].find((i) => m[i] !== undefined) ?? 0;
		out.push([m[0], KIND[kind] ?? null]);
		at = m.index + m[0].length;
	}
	if (at < line.length) out.push([line.slice(at), null]);
	return out;
};

const CODE_TYPES =
	"ts tsx js jsx mjs cjs typescript javascript rs rust py python go java kt swift c h cpp cs rb php sh bash zsh shell json yaml yml toml css scss sql lock";
/** The highlighter of each file type, by extension or fence language. The rest stay plain. */
const LANGUAGES: Record<string, Highlighter> = {
	...Object.fromEntries(CODE_TYPES.split(" ").map((x) => [x, code])),
	feature: gherkin,
	gherkin,
	c4: likec4,
	likec4,
	dbml,
	mermaid,
	mmd: mermaid,
	md: markdown,
	markdown,
};

/** The highlighter of a file path or a fence language, or `null` for plain text. */
export function languageFor(name?: string): Highlighter | null {
	const key = (name?.includes(".") ? name.split(".").pop() : name)?.toLowerCase() ?? "";
	return LANGUAGES[key] ?? null;
}
