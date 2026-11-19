import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { type KeyboardEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { saveAs } from "@/lib/ipc/dialog";
import { DOC_DIR, slug, useDeckList, useSlideTheme } from "@/lib/knowledge";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	PlayIcon,
	PresentationChartIcon,
	XMarkIcon,
} from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { MarkdownView } from "@/ui/organisms/markdown-view";
import { ListTab } from "./list-tab";
import { CardHeader } from "./pages";
import { appendSlide, costingSlide, nextSlide, planningSlide } from "./work-slides";

// reveal.js loads on the first Markdown deck, not on the first screen.
const SlideDeck = lazy(() =>
	import("@/ui/organisms/slide-deck").then((m) => ({ default: m.SlideDeck })),
);

const isHtml = (path: string) => path.endsWith(".html");
const htmlPath = (path: string) => path.replace(/\.md$/, ".html");

const useDeckText = (path: string) =>
	useQuery({
		queryKey: ["knowledge", "thumb", path],
		queryFn: () => unwrap(commands.docReadOne(path)),
	}).data?.text;

const useSlides = (text: string | undefined) =>
	useQuery({
		queryKey: ["knowledge", "deck", text],
		queryFn: () => commands.slideParse(text ?? ""),
		enabled: text !== undefined,
		placeholderData: (prev) => prev,
	}).data?.slides ?? [];

/** The row under the stage: the slide before, the place in the deck, the slide after. */
function Pager({
	place,
	first,
	last,
	onBefore,
	onAfter,
}: {
	place: string;
	first?: boolean;
	last?: boolean;
	onBefore: () => void;
	onAfter: () => void;
}) {
	const k = useI18n().t.knowledge.slides;
	return (
		<div className="flex items-center gap-2.5">
			<IconButton variant="outline" label={k.before} disabled={first} onClick={onBefore}>
				<ChevronLeftIcon size={20} />
			</IconButton>
			<span className="font-semibold text-n-12">{place}</span>
			<IconButton variant="outline" label={k.after} disabled={last} onClick={onAfter}>
				<ChevronRightIcon size={20} />
			</IconButton>
		</div>
	);
}

/** The keys that move a deck. The host gives them to the frame when the frame has no focus. */
const KEYS = new Set([
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"PageUp",
	"PageDown",
	"Home",
	"End",
	" ",
]);

/**
 * One HTML deck (ADR 0016) in a frame with `sandbox="allow-scripts"` only: its script runs, but it
 * has no origin, so it cannot call the app or read a file. The app loads it from the `deck`
 * scheme, which adds a policy with no network. The browser mock has no scheme: it uses `srcdoc`.
 */
function HtmlDeck({ path, title }: { path: string; title: string }) {
	const { t, lang } = useI18n();
	const k = t.knowledge;
	const qc = useQueryClient();
	const [rev, setRev] = useState(0);
	const frame = useRef<HTMLIFrameElement>(null);
	const stage = useRef<HTMLElement>(null);
	const [present, setPresent] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const [exporting, setExporting] = useState(false);
	const app = isTauri();
	const text = useDeckText(path);
	// nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration -- the deck frame has an opaque origin: only "*" reaches it
	const send = (key: string) => frame.current?.contentWindow?.postMessage({ deckKey: key }, "*");
	const onKey = (e: KeyboardEvent<HTMLElement>) => {
		if (e.key === "Escape" && present) setPresent(false);
		else if (KEYS.has(e.key)) {
			e.preventDefault();
			send(e.key);
		}
	};
	useEffect(() => {
		if (!present) return;
		stage.current?.focus();
		// Escape inside the frame does not reach the host: the deck sends it as a message.
		const onMessage = (e: MessageEvent) => {
			if (e.source === frame.current?.contentWindow && e.data?.deckKey === "Escape")
				setPresent(false);
		};
		const onFull = () => document.fullscreenElement === null && setPresent(false);
		// nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation -- `e.source` is checked against the deck frame
		window.addEventListener("message", onMessage);
		document.addEventListener("fullscreenchange", onFull);
		void stage.current?.requestFullscreen?.().catch(() => {});
		return () => {
			window.removeEventListener("message", onMessage);
			document.removeEventListener("fullscreenchange", onFull);
			if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
		};
	}, [present]);
	/** Appends a planning or costing slide, built from the data, before the end of the stage. */
	const add = async (kind: "planning" | "costing") => {
		try {
			setFailure(null);
			setNote(null);
			const file = await unwrap(commands.docReadOne(path));
			const n = nextSlide(file.text);
			const sheets = await unwrap(commands.estimateList());
			const slide =
				kind === "costing"
					? costingSlide(sheets, k.slides, lang, n)
					: planningSlide(
							await Promise.all(
								sheets
									.filter((s) => s.state === "ready")
									.map(async (s) => ({
										name: s.name ?? s.slug,
										plan: await unwrap(commands.planGet(s.slug)),
									})),
							),
							k.slides,
							lang,
							n,
						);
			const w = await unwrap(
				commands.docWriteOne(path, appendSlide(file.text, slide), file.stamp, false),
			);
			if (w.conflict) throw new Error(t.knowledge.editor.conflict);
			await qc.invalidateQueries({ queryKey: ["knowledge", "thumb", path] });
			setRev((r) => r + 1);
		} catch (e) {
			setFailure(e);
		}
	};
	const exportPdf = async () => {
		try {
			setFailure(null);
			setNote(null);
			const dest = await saveAs(slug(title) || "deck", "pdf");
			if (!dest) return;
			setExporting(true);
			await unwrap(commands.deckPdf(path, dest));
			setNote(format(t.reports.exported, { path: dest }));
		} catch (e) {
			setFailure(e);
		} finally {
			setExporting(false);
		}
	};
	// The frame has no origin: the host gives it the keys, and cannot read the slide that it shows.
	const count = nextSlide(text ?? "") - 1;
	return (
		<section aria-label={title} className="flex min-w-0 flex-col gap-4">
			<CardHeader title={title}>
				<Button className="min-h-control" busy={exporting} onClick={() => void exportPdf()}>
					{k.slides.exportPdf}
				</Button>
				<Button variant="primary" className="min-h-control" onClick={() => setPresent(true)}>
					<PlayIcon size={16} />
					{k.slides.present}
				</Button>
			</CardHeader>
			{note ? (
				<p role="status" className="text-n-11">
					{note}
				</p>
			) : null}
			{failure ? <ErrorNotice error={failure} className="text-danger-text" /> : null}
			<section
				ref={stage}
				aria-label={present ? k.slides.present : k.slides.slides}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the stage takes the arrow keys for the frame
				tabIndex={0}
				onKeyDown={onKey}
				data-present={present ? "" : undefined}
				className={cn(
					present
						? "fixed inset-0 z-50 bg-surface-0"
						: "relative aspect-video max-h-[36vh] w-full overflow-hidden rounded-lg border border-dashed border-n-8 bg-surface-1",
				)}
			>
				{present ? (
					<IconButton
						label={t.common.close}
						className="absolute top-3 right-3 z-10 bg-surface-3"
						onClick={() => setPresent(false)}
					>
						<XMarkIcon size={16} />
					</IconButton>
				) : null}
				<iframe
					key={rev}
					ref={frame}
					title={title}
					sandbox="allow-scripts"
					src={app ? convertFileSrc(path, "deck") : undefined}
					srcDoc={app ? undefined : text}
					className="size-full border-0"
				/>
			</section>
			<Pager
				place={format(k.slides.count, { count })}
				onBefore={() => send("ArrowLeft")}
				onAfter={() => send("ArrowRight")}
			/>
			<div className="flex flex-wrap gap-2.5">
				<Button className="min-h-control" onClick={() => void add("planning")}>
					{k.slides.planning}
				</Button>
				<Button className="min-h-control" onClick={() => void add("costing")}>
					{k.slides.costing}
				</Button>
			</div>
		</section>
	);
}

/**
 * An older Markdown deck: read only. The stage shows one slide in the deck theme, with the pager and
 * the strip of slides. Present covers the window, and the last action asks an agent for HTML.
 */
function MarkdownDeck({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	const k = t.knowledge;
	const { ask } = useShell();
	const theme = useSlideTheme().data?.value;
	const [present, setPresent] = useState(false);
	const slides = useSlides(useDeckText(path));
	const [chosen, setChosen] = useState(1);
	const at = Math.min(chosen, Math.max(slides.length, 1));
	return (
		<section aria-label={title} className="flex min-w-0 flex-col gap-4">
			<CardHeader title={title}>
				<Button
					variant="primary"
					className="min-h-control"
					onClick={() => setPresent(true)}
					disabled={slides.length === 0}
				>
					<PlayIcon size={16} />
					{k.slides.present}
				</Button>
			</CardHeader>
			{theme ? (
				// The stage keeps its 16:9 box: a deck never shows an empty area of no height.
				<section
					aria-label={`${k.slides.slides} (${slides.length})`}
					className="flex aspect-video max-h-[36vh] w-full flex-col justify-center overflow-auto rounded-lg border border-dashed border-n-8 p-[6%] text-17"
					style={{ background: theme.background, color: theme.text, fontFamily: theme.font }}
				>
					<MarkdownView source={slides[at - 1] ?? ""} label={format(k.slides.slide, { n: at })} />
				</section>
			) : (
				<Loading rows={3} />
			)}
			<Pager
				place={format(k.slides.of, { n: at, count: slides.length })}
				first={at <= 1}
				last={at >= slides.length}
				onBefore={() => setChosen(at - 1)}
				onAfter={() => setChosen(at + 1)}
			/>
			<div className="flex flex-wrap gap-2.5">
				<Button
					className="min-h-control"
					onClick={() => ask(format(k.slides.askConvert, { from: path, to: htmlPath(path) }))}
				>
					{k.slides.convert}
				</Button>
			</div>
			<div className="overflow-x-auto p-0.5">
				<div className="flex gap-2.5">
					{slides.map((_, i) => (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: the slides keep their order
							key={i}
							type="button"
							aria-label={format(k.slides.slide, { n: i + 1 })}
							aria-pressed={i + 1 === at}
							onClick={() => setChosen(i + 1)}
							className={cn(
								"flex aspect-video w-30 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-n-8 bg-surface-1 font-medium text-n-11",
								i + 1 === at && "border-2 border-solid border-accent bg-accent-tint text-n-12",
							)}
						>
							{i + 1}
						</button>
					))}
				</div>
			</div>
			{present && theme ? (
				<Suspense fallback={null}>
					<SlideDeck
						present
						slides={slides}
						style={theme}
						label={k.slides.present}
						slideLabel={(n) => format(k.slides.slide, { n })}
						onLeave={() => setPresent(false)}
					/>
				</Suspense>
			) : null}
		</section>
	);
}

/** The face of a Markdown deck in the grid: its first slide on a 16:9 frame in the deck theme. */
function MarkdownThumb({ path, title }: { path: string; title: string }) {
	const theme = useSlideTheme().data?.value;
	const text = useDeckText(path);
	const first = (useSlides(text)[0] ?? "").split("\n").filter((l) => l.trim());
	const head = first.find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "") ?? title;
	const rest = first.filter((l) => !l.startsWith("#")).slice(0, 3);
	// Both colours or none: a background with no text colour leaves token text on the deck
	// background (light grey on white in the dark theme). Each line gets the colour too.
	const themed = theme?.background && theme.text ? theme : undefined;
	const ink = themed ? { color: themed.text } : undefined;
	return (
		<span
			// Token colours until the deck theme loads: the face never shows text on an unknown background.
			className="@container relative flex aspect-video flex-col justify-center gap-1.5 overflow-hidden rounded-lg border border-dashed border-n-8 bg-surface-1 px-4 text-n-12"
			style={
				themed
					? { background: themed.background, color: themed.text, fontFamily: themed.font }
					: undefined
			}
		>
			<span className="truncate text-16 font-semibold" style={ink}>
				{head}
			</span>
			{/* The lines show only where the face holds them: a centred line that overflows the face
			    sits on the page background (axe color-contrast). */}
			{rest.map((l, i) => (
				<span
					key={l}
					className={
						i === 0
							? "hidden truncate text-11 @[13rem]:block"
							: "hidden truncate text-11 @[17rem]:block"
					}
					style={ink}
				>
					{l.replace(/^[-*]\s*/, "")}
				</span>
			))}
		</span>
	);
}

/** The face of an HTML deck: its title. A live frame for each card would run every deck at once. */
function HtmlThumb({ title }: { title: string }) {
	return (
		<span className="flex aspect-video items-center overflow-hidden rounded-lg border border-dashed border-n-8 bg-surface-1 px-4 text-n-12">
			<span className="truncate text-16 font-semibold">{title}</span>
		</span>
	);
}

/** The line under the name of a deck: its number of slides. */
function DeckCount({ path }: { path: string }) {
	const k = useI18n().t.knowledge.slides;
	const text = useDeckText(path);
	const parsed = useSlides(isHtml(path) ? undefined : text).length;
	const count = isHtml(path) ? nextSlide(text ?? "") - 1 : parsed;
	return <span className="text-n-10">{format(k.count, { count })}</span>;
}

/**
 * Library / Slides: the decks of the repository as cards, and the open deck beside them (REQ-017).
 * New deck asks an agent.
 */
export function Slides() {
	const { t } = useI18n();
	const k = t.knowledge.slides;
	const { ask } = useShell();
	const rows = useDeckList().data;
	return (
		<ListTab
			title={k.title}
			icon={<PresentationChartIcon size={16} />}
			noun={k.newDeck}
			nameLabel={k.name}
			find={k.find}
			base={DOC_DIR.slides}
			rows={rows}
			create={(name) =>
				ask(format(k.askNew, { name, path: `${DOC_DIR.slides}/${slug(name)}.html` }))
			}
			thumb={(row) =>
				isHtml(row.path) ? (
					<HtmlThumb title={row.title} />
				) : (
					<MarkdownThumb path={row.path} title={row.title} />
				)
			}
			pills={(row) => <DeckCount path={row.path} />}
			extra={
				<Link to="/library/documents" className={buttonVariants()}>
					{k.fromDocument}
				</Link>
			}
		>
			{(row) =>
				isHtml(row.path) ? (
					<HtmlDeck path={row.path} title={row.title} />
				) : (
					<MarkdownDeck path={row.path} title={row.title} />
				)
			}
		</ListTab>
	);
}
