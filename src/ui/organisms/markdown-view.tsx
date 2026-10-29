import { Fragment, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useResolvedRef } from "@/lib/refs";
import { RefChip } from "../molecules/ref-chip";

type Block =
	| { type: "h"; level: number; text: string }
	| { type: "p"; text: string }
	| { type: "ul" | "ol"; items: string[] }
	| { type: "code"; text: string };

/** shortcut: headings, lists, code fences and paragraphs only, no tables or links; add a Markdown library when a page needs them. */
export function blocks(source: string): Block[] {
	const out: Block[] = [];
	let fence: string[] | null = null;
	for (const line of source.split("\n")) {
		if (line.trimStart().startsWith("```")) {
			if (fence) out.push({ type: "code", text: fence.join("\n") });
			fence = fence ? null : [];
			continue;
		}
		if (fence) {
			fence.push(line);
			continue;
		}
		const last = out.at(-1);
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
	if (fence) out.push({ type: "code", text: fence.join("\n") });
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

/** A ref in the text shows as a RefChip. The kinds are the ones that the app names. */
function Inline({ text, kinds }: { text: string; kinds: RegExp }) {
	return (
		<>
			{text.split(kinds).map((p, i) =>
				// An odd part is a ref: the regex has one group.
				i % 2 ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
					<Ref key={i} refId={p} />
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: the parts never reorder
					<Fragment key={i}>{p}</Fragment>
				),
			)}
		</>
	);
}

const HEAD = ["text-16", "text-14", "text-ui"];

/** The preview of a Markdown text. */
export function MarkdownView({ source, label }: { source: string; label: string }) {
	const { t } = useI18n();
	const kinds = new RegExp(`\\b((?:${Object.keys(t.refKind).join("|")}):[\\w./#@-]*[\\w/#])`);
	const inline = (text: string): ReactNode => <Inline text={text} kinds={kinds} />;
	return (
		<article aria-label={label} className="flex flex-col gap-2 text-ui">
			{blocks(source).map((b, i) => {
				const key = i;
				if (b.type === "h") {
					const H = `h${b.level + 1}` as "h2" | "h3" | "h4";
					return (
						<H key={key} className={`font-medium ${HEAD[b.level - 1]}`}>
							{inline(b.text)}
						</H>
					);
				}
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
