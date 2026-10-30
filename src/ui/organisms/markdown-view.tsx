import { Fragment, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useResolvedRef } from "@/lib/refs";
import { cn } from "@/lib/utils";
import { RefChip } from "../molecules/ref-chip";
import { MermaidView } from "./mermaid-view";

type Block =
	| { type: "h"; level: number; text: string }
	| { type: "p"; text: string }
	| { type: "ul" | "ol"; items: string[] }
	| { type: "code"; lang: string; text: string }
	| { type: "table"; head: string[]; rows: string[][]; sep: boolean };

const cells = (line: string) =>
	line
		.trim()
		.replace(/^\||\|$/g, "")
		.split("|")
		.map((c) => c.trim());

/** shortcut: headings, lists, tables, code fences and paragraphs; a link is `[text](https://…)`; no column alignment, no nested lists. */
export function blocks(source: string): Block[] {
	const out: Block[] = [];
	let fence: string[] | null = null;
	let lang = "";
	for (const line of source.split("\n")) {
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
		const head = /^(#{1,3})\s+(.*)$/.exec(line);
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
			className="text-accent-text underline focus-visible:outline-2 focus-visible:outline-accent-9"
			onClick={(e) => {
				e.preventDefault();
				unwrap(commands.openLink(url)).catch((err) => console.error(err));
			}}
		>
			{children}
		</a>
	);
}

/** A ref in the text shows as a RefChip, a link as a link. The kinds are the ones that the app names. */
function Inline({ text, kinds }: { text: string; kinds: RegExp | null }) {
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

const HEAD = ["text-16", "text-14", "text-ui"];

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
	const kinds = new RegExp(`\\b((?:${Object.keys(t.refKind).join("|")}):[\\w./#@-]*[\\w/#])`);
	const inline = (text: string): ReactNode => <Inline text={text} kinds={refs ? kinds : null} />;
	return (
		<article
			aria-label={label}
			className={cn(
				"flex flex-col gap-2 text-ui",
				reading && "gap-3 text-14 leading-6 text-n-12 [&_h2]:mt-2 [&_h2]:text-20",
			)}
		>
			{blocks(source).map((b, i) => {
				const key = i;
				if (b.type === "h") {
					const H = `h${b.level + 1}` as "h2" | "h3" | "h4";
					return (
						<H
							key={key}
							id={anchor ? `${anchor}-${i}` : undefined}
							className={`scroll-mt-3 font-medium ${HEAD[b.level - 1]}`}
						>
							{inline(b.text)}
						</H>
					);
				}
				if (b.type === "table")
					return (
						<div key={key} className="overflow-x-auto">
							<table className="w-full border-collapse text-left">
								<thead>
									<tr>
										{b.head.map((c, j) => (
											<th key={at(j)} className="border-b px-2 py-1 font-medium">
												{inline(c)}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{b.rows.map((r, j) => (
										<tr key={at(j)}>
											{r.map((c, k) => (
												<td key={at(k)} className="border-b px-2 py-1">
													{inline(c)}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					);
				if (b.type === "code" && b.lang === "mermaid")
					return <MermaidView key={key} source={b.text} label={t.ui.diagram} />;
				if (b.type === "code")
					return (
						<pre key={key} className="overflow-x-auto rounded-md bg-n-3 p-2 font-mono text-12">
							<code>{b.text}</code>
						</pre>
					);
				if (b.type === "p") return <p key={key}>{inline(b.text)}</p>;
				const List = b.type;
				return (
					<List key={key} className={`${b.type === "ul" ? "list-disc" : "list-decimal"} pl-5`}>
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
