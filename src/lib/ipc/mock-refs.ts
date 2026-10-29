// Mock only. The app parses refs with the `refs_parse` command. The mock needs the same grammar as
// `crates/shipyard-core/src/refs.rs`, so the tests share their cases.
const NAME = "[a-z0-9][a-z0-9-]*";
const ULID = "[0-7][0-9A-HJKMNP-TV-Z]{25}";

const GRAMMAR: Record<string, RegExp> = {
	project: new RegExp(`^${NAME}$`),
	member: new RegExp(`^${NAME}$`),
	diagram: new RegExp(`^${NAME}$`),
	model: new RegExp(`^${NAME}$`),
	adr: /^\d{4}$/,
	api: new RegExp(`^${NAME}$`),
	data: new RegExp(`^${NAME}$`),
	flow: new RegExp(`^${NAME}$`),
	screen: new RegExp(`^${NAME}$`),
	change: new RegExp(`^${NAME}$`),
	spec: new RegExp(`^${NAME}(#REQ-\\d{3,})?$`),
	test: new RegExp(`^${NAME}$`),
	q: /^Q-\d{3,}$/,
	wi: /^[A-Z][A-Z0-9]*-[1-9]\d*$/,
	est: new RegExp(`^${NAME}(#${NAME})?$`),
	wf: new RegExp(`^${NAME}$`),
	run: new RegExp(`^${ULID}(/${NAME})?$`),
	pr: new RegExp(`^${NAME}:[1-9]\\d*$`),
	commit: /^[0-9a-f]{7,40}$/,
	doc: /^(?!\/)(?!(?:.*\/)?\.\.(?:\/|$))[^\s\\]+$/,
	conn: new RegExp(`^${NAME}$`),
};

/** True when the text is one ref of the shared vocabulary (refs spec REQ-001, REQ-002). */
export function isRef(text: string): boolean {
	const i = text.indexOf(":");
	if (i < 0) return false;
	const kind = text.slice(0, i);
	return Object.hasOwn(GRAMMAR, kind) && GRAMMAR[kind]?.test(text.slice(i + 1)) === true;
}

/** What the `refs_parse` command returns. */
export function parseRef(text: string): { ref: string; kind: string } | null {
	return isRef(text) ? { ref: text, kind: text.slice(0, text.indexOf(":")) } : null;
}
