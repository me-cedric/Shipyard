import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState } from "react";
import { hiddenSection, PLACES, type PlaceId, sectionView } from "@/features/shell/places";
import { type SectionSpace, tabLabel } from "@/features/shell/spaces";
import { format, type Lang, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { SplitPane } from "@/ui/molecules/split-pane";
import { Tile } from "@/ui/molecules/tile";
import { blocks, MarkdownView } from "@/ui/organisms/markdown-view";
import { useManualTarget } from "./manual-target";

// The pages of `docs/guide/` ship inside the app: the manual works without a project and offline.
const RAW = import.meta.glob("/docs/guide/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;
// The pages of another language have the same file names in `docs/guide/<lang>/`.
const RAW_LANG = import.meta.glob("/docs/guide/*/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

/** The pages in reading order: the start, one page for each place, then the rest. The developer guide is not for the people who use the app. */
const ORDER = [
	"start",
	"today",
	"flow",
	"plan",
	"crew",
	"library",
	"code",
	"setup",
	"projects",
	"ask",
	"theming",
];

// The picture of each page: a screen of the registry `docs/designs/screens.json`, by its file name.
const PICTURES = import.meta.glob(
	"/docs/assets/screenshots/{first-run,home-light,flow-list,plan-people,crew,library,code-history,setup-start,projects,ask-bar,themes}.png",
	{ query: "?url", import: "default", eager: true },
) as Record<string, string>;
const PICTURE: Record<string, string> = {
	start: "first-run",
	today: "home-light",
	flow: "flow-list",
	plan: "plan-people",
	crew: "crew",
	library: "library",
	code: "code-history",
	setup: "setup-start",
	projects: "projects",
	ask: "ask-bar",
	theming: "themes",
};
const pictureOf = (page: string) => PICTURES[`/docs/assets/screenshots/${PICTURE[page]}.png`];

/** A page off the section switch whose help has a heading of its own: the label of its old tab. */
const OFF_SWITCH: Record<string, [SectionSpace, string]> = { "flow/impacts": ["code", "impacts"] };

export type ManualPage = { id: string; title: string; text: string };

/** The pages in a language. A page with no file in that language keeps its English text. */
export const manualFor = (lang: Lang): ManualPage[] =>
	ORDER.flatMap((id) => {
		const text = RAW_LANG[`/docs/guide/${lang}/${id}.md`] ?? RAW[`/docs/guide/${id}.md`];
		if (!text) return [];
		const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? id;
		return [{ id, title, text }];
	});

export const MANUAL = manualFor("en");

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
 * The manual: the user guide that ships with the app, with a full-text search. The action
 * Open the manual for this page opens the page of the place and the section that the person was on.
 */
export function Manual() {
	const { t, lang } = useI18n();
	const m = t.knowledge.manual;
	const pages = useMemo(() => manualFor(lang), [lang]);
	const anchor = useId();
	const target = useManualTarget();
	const navigate = useNavigate();
	const { ask, setShortcutsOpen } = useShell();
	const { level } = useRights();
	const [page, setPage] = useState("start");
	const [query, setQuery] = useState("");
	const [scrollTo, setScrollTo] = useState<string | null>(null);
	const current = pages.find((p) => p.id === page) ?? pages[0];
	const hits = useMemo(() => searchManual(query, pages), [query, pages]);
	const picture = current ? pictureOf(current.id) : undefined;

	// A new ask opens the page of its place at the heading of its section.
	useEffect(() => {
		if (!target) return;
		const known = pages.some((p) => p.id === target.page);
		setPage(known ? target.page : "start");
		// The heading of a section is its label on the screen.
		const view =
			target.tab && target.page in PLACES
				? (sectionView(target.page as PlaceId, target.tab) ??
					OFF_SWITCH[`${target.page}/${target.tab}`])
				: undefined;
		const heading = view ? tabLabel(t, ...view) : null;
		setScrollTo(known ? heading : null);
		setQuery("");
	}, [target, pages, t]);

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
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader title={m.title} action={<Badge>F1</Badge>} />
			<div className="flex min-h-0 flex-1 gap-6 px-4 pb-4">
				<SplitPane id="knowledge-manual-width" label={t.knowledge.resize.manual} fallback={336}>
					<aside className="flex min-h-0 shrink-0 flex-col gap-2 overflow-auto p-0.5">
						<Input
							type="search"
							className="shrink-0"
							label={m.search}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						{query.trim() ? (
							<section aria-label={m.results} className="flex flex-col gap-2">
								<h2 className="text-13 font-semibold text-n-11" aria-live="polite">
									{m.results} ({hits.length})
								</h2>
								<ul className="flex flex-col gap-2">
									{hits.map((h) => (
										<li key={`${h.page}-${h.heading}`}>
											<button
												type="button"
												onClick={() => open(h.page, h.heading)}
												className="flex w-full flex-col justify-center rounded-lg bg-surface-2 px-4.5 py-3 text-left shadow-2"
											>
												<span className="font-semibold text-n-12">
													{h.title} / {h.heading}
												</span>
												<span className="line-clamp-2 text-13 text-n-11">{h.snippet}</span>
											</button>
										</li>
									))}
								</ul>
							</section>
						) : (
							<nav aria-label={m.pages} className="flex flex-col gap-2">
								{pages.map((p) => (
									<Tile
										key={p.id}
										label={p.title}
										aria-current={p.id === page ? "page" : undefined}
										onClick={() => open(p.id, null)}
										// A page of a list is the current one, not a pressed switch: the look of `selected` without its state.
										className={cn(
											"min-h-15 shrink-0 justify-center py-0",
											p.id === page && "bg-accent-tint outline-2 outline-accent",
										)}
									/>
								))}
							</nav>
						)}
					</aside>
				</SplitPane>
				<Card pad className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
					{/* The page scrolls with the keyboard too: the region takes the focus. */}
					<section
						aria-label={m.title}
						// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs the focus for the keyboard
						tabIndex={0}
						className="min-h-0 flex-1 overflow-auto rounded-md"
					>
						<div className="flex max-w-[640px] flex-col gap-4 pb-1">
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
							{current && picture ? (
								<img
									src={picture}
									alt={format(m.picture, { page: current.title })}
									loading="lazy"
									className="w-full rounded-field border border-n-6"
								/>
							) : null}
						</div>
					</section>
					<div className="flex shrink-0 flex-wrap gap-2.5">
						<Button
							variant="primary"
							disabled={!current}
							onClick={() => current && ask(format(m.askText, { page: current.title }))}
						>
							{m.ask}
						</Button>
						<Button onClick={() => setShortcutsOpen(true)}>{t.shell.menu.shortcuts}</Button>
						{/* The handbook is a page of Library: a role that hides it gets no button. */}
						{hiddenSection(level, "knowledge", "handbook") ? null : (
							<Button onClick={() => void navigate({ to: "/library/handbook" })}>
								{m.handbook}
							</Button>
						)}
					</div>
				</Card>
			</div>
		</div>
	);
}
