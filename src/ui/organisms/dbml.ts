/**
 * DBML parsing for the Data models tab.
 *
 * A hand-written parser for the DBML subset this app produces and reads:
 * `Table` blocks with typed columns, `[pk]` / `[not null]` / inline
 * `[ref: > table.column]` flags, quoted and schema-qualified names, one-line
 * and block `Ref` relations (composite endpoints included), `//` and
 * `/* *\/` comments. `Enum`, `Project`, `Note` and `indexes` blocks are
 * skipped, not parsed.
 *
 * It replaces `@dbml/core` (a 15 MB chunk) for a surface this small.
 */

export interface ParsedField {
	name: string;
	type: string;
	pk: boolean;
	notNull: boolean;
}

export interface ParsedTable {
	name: string;
	fields: ParsedField[];
}

export interface ParsedRef {
	from: string;
	to: string;
}

export interface Parsed {
	tables: ParsedTable[];
	refs: ParsedRef[];
}

/** A ref tagged with where it was found, so refs from different sources sort back into source order. */
interface PositionedRef {
	ref: ParsedRef;
	pos: number;
}

class DbmlSyntaxError extends Error {}

function fail(message: string, text: string, pos: number): never {
	const line = text.slice(0, pos).split("\n").length;
	throw new DbmlSyntaxError(`${message} (line ${line})`);
}

function skipWs(text: string, pos: number): number {
	let i = pos;
	while (i < text.length && /\s/.test(text[i] ?? "")) i++;
	return i;
}

/** `text[pos]` is a quote char (`'` or `"`), or the start of a `'''` block. */
function skipQuoted(text: string, pos: number): number {
	if (text.slice(pos, pos + 3) === "'''") {
		const end = text.indexOf("'''", pos + 3);
		return end === -1 ? text.length : end + 3;
	}
	const q = text[pos];
	let i = pos + 1;
	while (i < text.length) {
		if (text[i] === "\\") {
			i += 2;
			continue;
		}
		if (text[i] === q) return i + 1;
		i++;
	}
	return text.length;
}

/** Index of the `close` that matches `text[openIdx] === open`, quote-aware. */
function findMatchingClose(text: string, openIdx: number, open: string, close: string): number {
	let depth = 0;
	let i = openIdx;
	while (i < text.length) {
		const c = text[i];
		if (c === '"' || c === "'") {
			i = skipQuoted(text, i);
			continue;
		}
		if (c === open) {
			depth++;
			i++;
			continue;
		}
		if (c === close) {
			depth--;
			i++;
			if (depth === 0) return i - 1;
			continue;
		}
		i++;
	}
	return -1;
}

function blankQuotes(s: string): string {
	const out = s.split("");
	let i = 0;
	while (i < s.length) {
		if (s[i] === '"' || s[i] === "'") {
			const end = skipQuoted(s, i);
			for (let j = i; j < end && j < s.length; j++) out[j] = " ";
			i = end;
		} else i++;
	}
	return out.join("");
}

/** Strip `//` and `/* *\/` comments, keeping every other character and line in place. */
function stripComments(text: string): string {
	const out = text.split("");
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (c === '"' || c === "'") {
			i = skipQuoted(text, i);
			continue;
		}
		if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") {
				out[i] = " ";
				i++;
			}
			continue;
		}
		if (c === "/" && text[i + 1] === "*") {
			out[i] = " ";
			out[i + 1] = " ";
			i += 2;
			while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
				if (text[i] !== "\n") out[i] = " ";
				i++;
			}
			if (i < text.length) {
				out[i] = " ";
				out[i + 1] = " ";
				i += 2;
			}
			continue;
		}
		i++;
	}
	return out.join("");
}

/** A quoted string or a bare identifier — no dots. */
function parseSimpleName(text: string, pos: number): { name: string; next: number } | null {
	const p = skipWs(text, pos);
	if (text[p] === '"') {
		const end = skipQuoted(text, p);
		return { name: text.slice(p + 1, end - 1), next: end };
	}
	const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(p));
	return m ? { name: m[0], next: p + m[0].length } : null;
}

/** `schema.table` or `table` — only the last segment is kept, like `@dbml/core` did. */
function parseDottedTableName(text: string, pos: number): { name: string; next: number } {
	const first = parseSimpleName(text, pos);
	if (!first) fail("Expected table name", text, pos);
	let name = first.name;
	let next = first.next;
	while (text[next] === "." && /[A-Za-z_"]/.test(text[next + 1] ?? "")) {
		const seg = parseSimpleName(text, next + 1);
		if (!seg) break;
		name = seg.name;
		next = seg.next;
	}
	return { name, next };
}

function parseTypeToken(text: string, pos: number): { type: string; next: number } {
	const p = skipWs(text, pos);
	if (text[p] === '"') {
		const end = skipQuoted(text, p);
		return { type: text.slice(p + 1, end - 1), next: end };
	}
	const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(p));
	if (!m) fail("Expected column type", text, p);
	let type = m[0];
	let next = p + m[0].length;
	while (text[next] === ".") {
		const seg = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(next + 1));
		if (!seg) break;
		type = seg[0];
		next = next + 1 + seg[0].length;
	}
	if (text[next] === "(") {
		const close = findMatchingClose(text, next, "(", ")");
		if (close === -1) fail("Unclosed '(' in column type", text, next);
		type += text.slice(next, close + 1);
		next = close + 1;
	}
	return { type, next };
}

function parseBracket(
	text: string,
	pos: number,
	open: string,
	close: string,
): { content: string; next: number } {
	const end = findMatchingClose(text, pos, open, close);
	if (end === -1) fail(`Unclosed '${open}'`, text, pos);
	return { content: text.slice(pos + 1, end), next: end + 1 };
}

function parseSettings(content: string): { pk: boolean; notNull: boolean } {
	const blank = blankQuotes(content);
	return {
		pk: /\bpk\b/i.test(blank) || /\bprimary\s+key\b/i.test(blank),
		notNull: /\bnot\s+null\b/i.test(blank),
	};
}

/**
 * An inline `ref: > table.column` inside a column's `[...]` settings, order-free
 * among the other settings. `contentStart` is `content`'s absolute offset into
 * `text`, so the target endpoint is parsed straight off `text` (quotes and
 * composite `(a, b)` lists intact) by reusing `parseEndpoint`.
 */
function findInlineRefTarget(
	text: string,
	content: string,
	contentStart: number,
): { tableName: string; fieldNames: string[] } | null {
	const blank = blankQuotes(content);
	const m = /\bref\s*:/i.exec(blank);
	if (!m) return null;
	const opPos = skipWs(text, contentStart + m.index + m[0].length);
	const op = /^(<>|>|<|-)/.exec(text.slice(opPos));
	if (!op) fail("Expected relationship operator (>, <, - or <>) after ref:", text, opPos);
	const target = parseEndpoint(text, opPos + op[0].length);
	return { tableName: target.tableName, fieldNames: target.fieldNames };
}

function parseColumn(
	text: string,
	pos: number,
	tableName: string,
): { field: ParsedField; next: number; ref?: PositionedRef } {
	const nameTok = parseSimpleName(text, pos);
	if (!nameTok) fail("Expected column name", text, pos);
	const typeTok = parseTypeToken(text, nameTok.next);
	let p = skipWs(text, typeTok.next);
	let pk = false;
	let notNull = false;
	let ref: PositionedRef | undefined;
	if (text[p] === "[") {
		const bracketStart = p;
		const settings = parseBracket(text, p, "[", "]");
		({ pk, notNull } = parseSettings(settings.content));
		const target = findInlineRefTarget(text, settings.content, bracketStart + 1);
		if (target) {
			ref = {
				ref: {
					from: `${tableName}.${nameTok.name}`,
					to: `${target.tableName}.${target.fieldNames.join(",")}`,
				},
				pos: bracketStart,
			};
		}
		p = settings.next;
	}
	return { field: { name: nameTok.name, type: typeTok.type, pk, notNull }, next: p, ref };
}

/** Skip a nested `indexes { ... }` or one-line/block `Note` inside a table. */
function skipTableAside(text: string, pos: number, word: string): number | null {
	if (word === "indexes") {
		const brace = skipWs(text, pos);
		if (text[brace] !== "{") return null;
		const close = findMatchingClose(text, brace, "{", "}");
		if (close === -1) fail("Unclosed 'indexes' block", text, brace);
		return close + 1;
	}
	if (word === "Note") {
		const after = skipWs(text, pos);
		if (text[after] === "{") {
			const close = findMatchingClose(text, after, "{", "}");
			if (close === -1) fail("Unclosed 'Note' block", text, after);
			return close + 1;
		}
		const nl = text.indexOf("\n", pos);
		return nl === -1 ? text.length : nl + 1;
	}
	return null;
}

function parseTableBody(
	text: string,
	pos: number,
	end: number,
	tableName: string,
): { fields: ParsedField[]; refs: PositionedRef[] } {
	const fields: ParsedField[] = [];
	const refs: PositionedRef[] = [];
	let p = skipWs(text, pos);
	while (p < end) {
		const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(p, end));
		const asideNext = word ? skipTableAside(text, p + word[0].length, word[0]) : null;
		if (asideNext !== null) {
			p = skipWs(text, asideNext);
			continue;
		}
		const { field, next, ref } = parseColumn(text, p, tableName);
		fields.push(field);
		if (ref) refs.push(ref);
		p = skipWs(text, next);
	}
	return { fields, refs };
}

function parseTable(
	text: string,
	pos: number,
): { table: ParsedTable; refs: PositionedRef[]; next: number } {
	let p = skipWs(text, pos);
	const nameTok = parseDottedTableName(text, p);
	p = skipWs(text, nameTok.next);
	const asMatch = /^as\b/.exec(text.slice(p));
	if (asMatch) {
		const alias = parseSimpleName(text, p + asMatch[0].length);
		p = skipWs(text, alias ? alias.next : p + asMatch[0].length);
	}
	if (text[p] === "[") {
		p = skipWs(text, parseBracket(text, p, "[", "]").next);
	}
	if (text[p] !== "{") fail("Expected '{' after table name", text, p);
	const bodyEnd = findMatchingClose(text, p, "{", "}");
	if (bodyEnd === -1) fail("Unclosed table block", text, p);
	const { fields, refs } = parseTableBody(text, p + 1, bodyEnd, nameTok.name);
	return { table: { name: nameTok.name, fields }, refs, next: bodyEnd + 1 };
}

function stripQuotesAround(s: string): string {
	if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s[s.length - 1] === s[0]) {
		return s.slice(1, -1);
	}
	return s;
}

/** `table.column` or `table.(a, b)`, schema prefix dropped either way. */
function parseEndpoint(
	text: string,
	pos: number,
): { tableName: string; fieldNames: string[]; next: number } {
	const p0 = skipWs(text, pos);
	const first = parseSimpleName(text, p0);
	if (!first) fail("Expected table reference", text, p0);
	const segments = [first.name];
	let p = first.next;
	for (;;) {
		if (text[p] !== ".") break;
		if (text[p + 1] === "(") {
			const close = findMatchingClose(text, p + 1, "(", ")");
			if (close === -1) fail("Unclosed '(' in reference", text, p + 1);
			const fieldNames = text
				.slice(p + 2, close)
				.split(",")
				.map((s) => stripQuotesAround(s.trim()));
			return { tableName: segments[segments.length - 1] ?? "", fieldNames, next: close + 1 };
		}
		const seg = parseSimpleName(text, p + 1);
		if (!seg) break;
		segments.push(seg.name);
		p = seg.next;
	}
	if (segments.length < 2) fail("Expected 'table.column'", text, pos);
	return {
		tableName: segments[segments.length - 2] ?? "",
		fieldNames: [segments[segments.length - 1] ?? ""],
		next: p,
	};
}

function parseRelation(text: string, pos: number): { ref: ParsedRef; next: number } {
	const a = parseEndpoint(text, pos);
	const opPos = skipWs(text, a.next);
	const op = /^(<>|>|<|-)/.exec(text.slice(opPos));
	if (!op) fail("Expected relationship operator (>, <, - or <>)", text, opPos);
	const b = parseEndpoint(text, opPos + op[0].length);
	return {
		ref: {
			from: `${a.tableName}.${a.fieldNames.join(",")}`,
			to: `${b.tableName}.${b.fieldNames.join(",")}`,
		},
		next: b.next,
	};
}

/** Trailing `[delete: cascade]`-style settings after a relation — skipped. */
function skipTrailingSettings(text: string, pos: number): number {
	const p = skipWs(text, pos);
	if (text[p] !== "[") return pos;
	const close = findMatchingClose(text, p, "[", "]");
	return close === -1 ? pos : close + 1;
}

function parseRefBlockBody(text: string, pos: number, end: number): PositionedRef[] {
	const refs: PositionedRef[] = [];
	let p = skipWs(text, pos);
	while (p < end) {
		const start = p;
		const { ref, next } = parseRelation(text, p);
		refs.push({ ref, pos: start });
		p = skipWs(text, skipTrailingSettings(text, next));
	}
	return refs;
}

/** `pos` is right after the `Ref` keyword — one-line `:` form or a `{ }` block. */
function parseRefConstruct(text: string, pos: number): { refs: PositionedRef[]; next: number } {
	let p = skipWs(text, pos);
	if (text[p] !== ":" && text[p] !== "{") {
		const name = parseSimpleName(text, p);
		if (name) p = skipWs(text, name.next);
	}
	if (text[p] === ":") {
		const start = p + 1;
		const { ref, next } = parseRelation(text, start);
		return { refs: [{ ref, pos: start }], next: skipTrailingSettings(text, next) };
	}
	if (text[p] === "{") {
		const close = findMatchingClose(text, p, "{", "}");
		if (close === -1) fail("Unclosed Ref block", text, p);
		return { refs: parseRefBlockBody(text, p + 1, close), next: close + 1 };
	}
	fail("Expected ':' or '{' after Ref", text, p);
}

/**
 * `pos` is right after `Enum` / `Project` / `Note` — the optional block name may
 * be followed by `{` on the same line or, as real DBML allows, the next one.
 */
function skipNamedBlock(text: string, pos: number): number {
	let p = skipWs(text, pos);
	const name = parseSimpleName(text, p);
	if (name) p = skipWs(text, name.next);
	if (text[p] === "{") {
		const close = findMatchingClose(text, p, "{", "}");
		if (close === -1) fail("Unclosed block", text, p);
		return close + 1;
	}
	const nl = text.indexOf("\n", pos);
	return nl === -1 ? text.length : nl + 1;
}

function parseDbmlBody(text: string): Parsed {
	const clean = stripComments(text);
	const tables: ParsedTable[] = [];
	const refs: PositionedRef[] = [];
	let p = skipWs(clean, 0);
	while (p < clean.length) {
		const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(clean.slice(p));
		if (!m) fail("Unexpected character", clean, p);
		const kw = m[0];
		const bodyPos = p + kw.length;
		if (kw === "Table") {
			const { table, refs: tableRefs, next } = parseTable(clean, bodyPos);
			tables.push(table);
			refs.push(...tableRefs);
			p = next;
		} else if (kw === "Ref") {
			const { refs: found, next } = parseRefConstruct(clean, bodyPos);
			refs.push(...found);
			p = next;
		} else if (kw === "Enum" || kw === "Project" || kw === "Note") {
			p = skipNamedBlock(clean, bodyPos);
		} else {
			fail(`Unknown block "${kw}"`, clean, p);
		}
		p = skipWs(clean, p);
	}
	refs.sort((a, b) => a.pos - b.pos);
	return { tables, refs: refs.map((r) => r.ref) };
}

/** Parse DBML source. Never throws — an invalid model returns its message. */
export function parseDbml(text: string): { data?: Parsed; error?: string } {
	if (!text.trim()) return { data: { tables: [], refs: [] } };
	try {
		return { data: parseDbmlBody(text) };
	} catch (e) {
		return { error: e instanceof Error ? e.message : "Invalid DBML" };
	}
}
