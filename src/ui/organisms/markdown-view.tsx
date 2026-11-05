import { Fragment, type ReactNode, useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { foldWords, useHitQuery, useResolvedRef } from "@/lib/refs";
import { cn } from "@/lib/utils";
import { CodeLine } from "../molecules/code-editor";
import { RefChip } from "../molecules/ref-chip";
import { MermaidView } from "./mermaid-view";

type Block =
	| { type: "h"; level: number; text: string }
	| { type: "p"; text: string }
	| { type: "quote"; text: string }
	| { type: "ul" | "ol"; items: string[] }
	| { type: "code"; lang: string; text: string }
	| { type: "table"; head: string[]; rows: string[][]; sep: boolean };

const cells = (line: string) =>
	line
		.trim()
		.replace(/^\||\|$/g, "")
		.split("|")
		.map((c) => c.trim());

/** shortcut: headings, lists, tables, code fences, quotes and paragraphs; `**bold**`, `` `code` `` and a link is `[text](https://…)`; no column alignment, no nested lists. */
export function blocks(source: string): Block[] {
	const out: Block[] = [];
	let fence: string[] | null = null;
	let lang = "";
	for (const line of source.split(/\r?\n/)) {
		if (line.trimStart().startsWith("```")) {
			if (fence) out.push({ type: "code", lang, text: fence.join("\n") });
			else lang = line.trim().slice(3).trim().split(/\s+/)[0] ?? "";
			fence = fence ? null : [];
			continue;
		}
		if (fence) {
			fence.push(line);
			continue;
		}
		const last = out.at(-1);
		if (/^\s*\|.*\|\s*$/.test(line)) {
			if (last?.type !== "table")
				out.push({ type: "table", head: cells(line), rows: [], sep: false });
			else if (!last.sep && last.rows.length === 0 && /^[\s|:-]+$/.test(line)) last.sep = true;
			else last.rows.push(cells(line));
			continue;
		}
		const quote = /^\s*>\s?(.*)$/.exec(line);
		if (quote) {
			if (last?.type === "quote") last.text += ` ${quote[1]}`;
			else out.push({ type: "quote", text: quote[1] ?? "" });
			continue;
		}
		const head = /^(#{1,6})\s+(.*)$/.exec(line);
		const item = /^\s*(?:([-*])|\d+\.)\s+(.*)$/.exec(line);
		if (head) out.push({ type: "h", level: (head[1] ?? "#").length, text: head[2] ?? "" });
		else if (item) {
			const type = item[1] ? "ul" : "ol";
			if (last?.type === type) last.items.push(item[2] ?? "");
			else out.push({ type, items: [item[2] ?? ""] });
		} else if (line.trim() === "") out.push({ type: "p", text: "" });
		else if (last?.type === "p" && last.text) last.text += ` ${line.trim()}`;
		else out.push({ type: "p", text: line.trim() });
	}
	if (fence) out.push({ type: "code", lang, text: fence.join("\n") });
	return out.filter((b) => b.type !== "p" || b.text);
}

function Ref({ refId }: { refId: string }) {
	const resolved = useResolvedRef(refId).data;
	return (
		<RefChip
			refId={refId}
			state={resolved?.state ?? "unresolved"}
			title={resolved?.title ?? undefined}
		/>
	);
}

/** The key of a part that never reorders: its place in the text. */
const at = (...n: number[]) => n.join("-");

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;

/** A link opens in the browser of the system, never in the window of the app. */
export function Link({ url, children }: { url: string; children: ReactNode }) {
	return (
		<a
			href={url}
			rel="noreferrer"
			className="text-accent-text underline"
			onClick={(e) => {
				e.preventDefault();
				unwrap(commands.openLink(url)).catch(logError);
			}}
		>
			{children}
		</a>
	);
}

const EMPHASIS = /(\*\*[^*]+\*\*|`[^`]+`)/;

/** `**bold**` and `code` spans, then refs and links inside the rest. */
function Inline({ text, kinds }: { text: string; kinds: RegExp | null }) {
	return (
		<>
			{text.split(EMPHASIS).map((part, i) => {
				if (i % 2 === 0) return <Plain key={at(i)} text={part} kinds={kinds} />;
				if (part.startsWith("`"))
					return (
						<code key={at(i)} className="rounded bg-n-3 px-1 font-mono text-12 break-words">
							{part.slice(1, -1)}
						</code>
					);
				return (
					<strong key={at(i)} className="font-semibold">
						<Inline text={part.slice(2, -2)} kinds={kinds} />
					</strong>
				);
			})}
		</>
	);
}

/** A ref in the text shows as a RefChip, a link as a link. The kinds are the ones that the app names. */
function Plain({ text, kinds }: { text: string; kinds: RegExp | null }) {
	// The split keeps the two groups of a link: text, label, address, text, ...
	const parts = text.split(new RegExp(LINK.source, "g"));
	return (
		<>
			{parts.map((part, i) => {
				if (i % 3 === 1)
					return (
						<Link key={at(i)} url={parts[i + 1] ?? ""}>
							{part}
						</Link>
					);
				if (i % 3 === 2) return null;
				return (kinds ? part.split(kinds) : [part]).map((p, j) =>
					j % 2 ? <Ref key={at(i, j)} refId={p} /> : <Fragment key={at(i, j)}>{p}</Fragment>,
				);
			})}
		</>
	);
}

/** A huge document must not pass the argument limit of `Highlight` (a `RangeError`). */
const MAX_HITS = 5000;

/**
 * Marks the words of `query` in the text nodes of `root` with the `search-hit` highlight. Where
 * the CSS Custom Highlight API is missing, nothing is marked.
 */
export function markHits(root: HTMLElement, query: string): () => void {
	const api = (globalThis.CSS as { highlights?: Map<string, unknown> } | undefined)?.highlights;
	const Hl = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
	const words = foldWords(query);
	if (!api || !Hl || words.length === 0) return () => {};
	const ranges: Range[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n && ranges.length < MAX_HITS; n = walker.nextNode()) {
		// One folded character per source character, so a position maps back to the text.
		let folded = "";
		const from: number[] = [];
		(n.textContent ?? "").split("").forEach((c, i) => {
			for (const f of c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()) {
				folded += f;
				from.push(i);
			}
		});
		for (const w of words)
			for (
				let at = folded.indexOf(w);
				at >= 0 && ranges.length < MAX_HITS;
				at = folded.indexOf(w, at + w.length)
			) {
				const r = document.createRange();
				r.setStart(n, from[at] ?? 0);
				r.setEnd(n, (from[at + w.length - 1] ?? 0) + 1);
				ranges.push(r);
			}
	}
	api.set("search-hit", new Hl(...ranges));
	return () => void api.delete("search-hit");
}

const HEAD = ["text-16", "text-14", "text-ui"];
const CELL_LONG = 28;

/**
 * The preview of a Markdown text. With `anchor`, the heading of block `i` gets the id
 * `<anchor>-<i>`, so a table of contents can scroll to it. `reading` sets the reading type.
 */
export function MarkdownView({
	source,
	label,
	anchor,
	reading,
	refs = true,
}: {
	source: string;
	label: string;
	anchor?: string;
	reading?: boolean;
	/** False keeps a ref as plain text: the assistant lists its refs apart. */
	refs?: boolean;
}) {
	const { t } = useI18n();
	const hits = useHitQuery();
	const root = useRef<HTMLElement>(null);
	// Only the open document marks hits: `reading` is its type.
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new source draws new text nodes
	useEffect(
		() => (reading && root.current ? markHits(root.current, hits) : undefined),
		[reading, hits, source],
	);
	const kinds = new RegExp(`\\b((?:${Object.keys(t.refKind).join("|")}):[\\w./#@-]*[\\w/#])`);
	const inline = (text: string): ReactNode => <Inline text={text} kinds={refs ? kinds : null} />;
	return (
		<article
			ref={root}
			aria-label={label}
			className={cn(
				"flex flex-col gap-2 text-ui",
				reading && "gap-3 text-14 leading-6 text-n-12 [&_h2]:mt-2 [&_h2]:text-20",
			)}
		>
			{blocks(source).map((b, i) => {
				const key = i;
				if (b.type === "h") {
					const H = `h${Math.min(b.level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
					return (
						<H
							key={key}
							id={anchor ? `${anchor}-${i}` : undefined}
							className={`scroll-mt-3 mt-1 font-medium ${HEAD[b.level - 1] ?? "text-ui"}`}
						>
							{inline(b.text)}
						</H>
					);
				}
				if (b.type === "table") {
					// A short cell keeps its line; a long one wraps at word boundaries.
					const cell = (c: string) =>
						c.length > CELL_LONG ? "min-w-48 max-w-md break-words" : "whitespace-nowrap";
					return (
						<div key={key} className="overflow-x-auto rounded-md border">
							<table className="w-full table-auto border-collapse text-left text-ui">
								<thead className="bg-n-3">
									<tr>
										{b.head.map((c, j) => (
											<th
												key={at(j)}
												className={cn("border-b px-2 py-1 text-12 font-medium text-n-11", cell(c))}
											>
												{inline(c)}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{b.rows.map((r, j) => (
										<tr key={at(j)} className="border-b last:border-b-0 even:bg-n-2">
											{r.map((c, k) => (
												<td key={at(k)} className={cn("px-2 py-1 align-top", cell(c))}>
													{inline(c)}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					);
				}
				if (b.type === "code" && b.lang === "mermaid")
					return <MermaidView key={key} source={b.text} label={t.ui.diagram} />;
				if (b.type === "code")
					return (
						<pre key={key} className="overflow-x-auto rounded-md bg-n-3 p-2 font-mono text-12">
							<code>
								{b.text.split("\n").map((l, j, all) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: the lines never reorder
									<Fragment key={j}>
										<CodeLine text={l} lang={b.lang} />
										{j < all.length - 1 ? "\n" : null}
									</Fragment>
								))}
							</code>
						</pre>
					);
				if (b.type === "p")
					return (
						<p key={key} className="break-words">
							{inline(b.text)}
						</p>
					);
				if (b.type === "quote")
					return (
						<blockquote key={key} className="border-l-2 border-n-7 pl-3 text-n-11 break-words">
							{inline(b.text)}
						</blockquote>
					);
				const List = b.type;
				return (
					<List
						key={key}
						className={`${b.type === "ul" ? "list-disc" : "list-decimal"} flex flex-col gap-0.5 pl-5`}
					>
						{b.items.map((x, j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: the items never reorder
							<li key={j}>{inline(x)}</li>
						))}
					</List>
				);
			})}
		</article>
	);
}
