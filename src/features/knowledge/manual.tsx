import { useEffect, useId, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/atoms/input";
import { BookOpenIcon, MagnifyingGlassIcon } from "@/ui/icons";
import { blocks, MarkdownView } from "@/ui/organisms/markdown-view";
import { ListDetail } from "@/ui/templates/list-detail";
import { useManualTarget } from "./manual-target";

// The pages of `docs/guide/` ship inside the app: the manual works without a project and offline.
const RAW = import.meta.glob("/docs/guide/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

/** The pages in reading order. The developer guide is not for the people who use the app. */
const ORDER = [
	"start",
	"home",
	"design",
	"specs",
	"work",
	"factory",
	"code",
	"knowledge",
	"settings",
];

export type ManualPage = { id: string; title: string; text: string };

export const MANUAL: ManualPage[] = ORDER.flatMap((id) => {
	const text = RAW[`/docs/guide/${id}.md`];
	if (!text) return [];
	const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? id;
	return [{ id, title, text }];
});

const plain = (line: string) =>
	line
		.replace(/[`*_|#>]/g, " ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/\s+/g, " ")
		.trim();

export type ManualHit = { page: string; title: string; heading: string; snippet: string };

/** Every section of every page that holds each word of the query. */
export function searchManual(query: string, pages: ManualPage[] = MANUAL): ManualHit[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const hits: ManualHit[] = [];
	for (const p of pages) {
		let heading = p.title;
		let lines: string[] = [];
		const flush = () => {
			const body = lines.map(plain).filter(Boolean);
			const all = `${heading} ${body.join(" ")}`.toLowerCase();
			if (words.every((w) => all.includes(w))) {
				const line = body.find((l) => words.some((w) => l.toLowerCase().includes(w))) ?? "";
				hits.push({ page: p.id, title: p.title, heading, snippet: line.slice(0, 160) });
			}
		};
		for (const line of p.text.split("\n")) {
			const h = /^#{1,3}\s+(.+)$/.exec(line);
			if (h) {
				flush();
				heading = h[1] ?? "";
				lines = [];
			} else lines.push(line);
		}
		flush();
	}
	return hits;
}

/** The block index of the heading named `heading`, for the scroll. */
const headingIndex = (text: string, heading: string) =>
	blocks(text).findIndex((b) => b.type === "h" && b.text === heading);

/**
 * Knowledge / Manual: the user guide that ships with the app, with a full-text search. The palette
 * action Open the manual for this page opens the section of the tab that the person was on.
 */
export function Manual() {
	const { t } = useI18n();
	const m = t.knowledge.manual;
	const anchor = useId();
	const target = useManualTarget();
	const [page, setPage] = useState(MANUAL[0]?.id ?? "start");
	const [query, setQuery] = useState("");
	const [scrollTo, setScrollTo] = useState<string | null>(null);
	const current = MANUAL.find((p) => p.id === page) ?? MANUAL[0];
	const hits = useMemo(() => searchManual(query), [query]);

	// A new ask of the palette opens its page at the section of its tab.
	useEffect(() => {
		if (!target) return;
		const known = MANUAL.some((p) => p.id === target.page);
		setPage(known ? target.page : "start");
		const tabs = en.tabs as Record<string, Record<string, string>>;
		setScrollTo(known && target.tab ? (tabs[target.page]?.[target.tab] ?? null) : null);
		setQuery("");
	}, [target]);

	useEffect(() => {
		if (!scrollTo || !current) return;
		const i = headingIndex(current.text, scrollTo);
		const el = i >= 0 ? document.getElementById(`${anchor}-${i}`) : null;
		el?.scrollIntoView?.({ block: "start" });
	}, [scrollTo, current, anchor]);

	const open = (id: string, heading: string | null) => {
		setPage(id);
		setScrollTo(heading);
	};

	return (
		<ListDetail title={m.title} icon={<BookOpenIcon size={16} />} count={MANUAL.length}>
			<div className="flex min-h-0 flex-1 gap-6 px-4 pb-4">
				<aside className="flex w-56 shrink-0 flex-col gap-3">
					<div className="relative">
						<span
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-n-10"
						>
							<MagnifyingGlassIcon size={14} />
						</span>
						<Input
							type="search"
							className="pl-7"
							label={m.search}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</div>
					{query.trim() ? (
						<section aria-label={m.results} className="flex min-h-0 flex-col gap-1 overflow-auto">
							<h2 className="text-12 font-medium text-n-11" aria-live="polite">
								{m.results} ({hits.length})
							</h2>
							<ul className="flex flex-col gap-1">
								{hits.map((h) => (
									<li key={`${h.page}-${h.heading}`}>
										<button
											type="button"
											onClick={() => open(h.page, h.heading)}
											className="flex w-full flex-col rounded-md px-2 py-1 text-left hover:bg-n-3"
										>
											<span className="text-ui text-n-12">
												{h.title} / {h.heading}
											</span>
											<span className="line-clamp-2 text-12 text-n-11">{h.snippet}</span>
										</button>
									</li>
								))}
							</ul>
						</section>
					) : (
						<nav aria-label={m.pages} className="flex flex-col gap-0.5">
							{MANUAL.map((p) => (
								<button
									key={p.id}
									type="button"
									aria-current={p.id === page ? "page" : undefined}
									onClick={() => open(p.id, null)}
									className={cn(
										"rounded-md px-2 py-1 text-left text-ui hover:bg-n-3",
										p.id === page ? "bg-n-3 font-medium text-n-12" : "text-n-11",
									)}
								>
									{p.title}
								</button>
							))}
						</nav>
					)}
				</aside>
				{/* The page scrolls with the keyboard too: the region takes the focus. */}
				<section
					aria-label={m.title}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs the focus for the keyboard
					tabIndex={0}
					className="min-w-0 flex-1 overflow-auto rounded-md"
				>
					<div className="mx-auto max-w-[680px] pb-4">
						{current ? (
							<MarkdownView
								key={current.id}
								source={current.text}
								label={current.title}
								anchor={anchor}
								refs={false}
								reading
							/>
						) : null}
					</div>
				</section>
			</div>
		</ListDetail>
	);
}
