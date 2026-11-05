import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { type KeyboardEvent, lazy, Suspense, useEffect, useRef, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { saveAs } from "@/lib/ipc/dialog";
import { DOC_DIR, slug, useDeckList, useSlideTheme } from "@/lib/knowledge";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import {
	ArrowDownTrayIcon,
	PlayIcon,
	PlusIcon,
	PresentationChartIcon,
	SparklesIcon,
} from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuButton } from "@/ui/molecules/menu-button";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { ListTab } from "./list-tab";
import { appendSlide, costingSlide, nextSlide, planningSlide } from "./work-slides";

// reveal.js loads on the first Markdown deck, not on the first screen.
const SlideDeck = lazy(() =>
	import("@/ui/organisms/slide-deck").then((m) => ({ default: m.SlideDeck })),
);

const isHtml = (path: string) => path.endsWith(".html");
const htmlPath = (path: string) => path.replace(/\.md$/, ".html");

const useDeckText = (path: string, enabled = true) =>
	useQuery({
		queryKey: ["knowledge", "thumb", path],
		queryFn: () => unwrap(commands.docReadOne(path)),
		enabled,
	}).data?.text;

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
	const app = isTauri();
	const text = useDeckText(path, !app);
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
			await unwrap(commands.deckPdf(path, dest));
			setNote(format(t.reports.exported, { path: dest }));
		} catch (e) {
			setFailure(e);
		}
	};
	return (
		<EditorFrame
			title={title}
			refId={`doc:${path}`}
			actions={
				<>
					<MenuButton
						label={k.slides.add}
						icon={<PlusIcon size={14} />}
						items={[
							{ id: "planning", label: k.slides.planning, onSelect: () => void add("planning") },
							{ id: "costing", label: k.slides.costing, onSelect: () => void add("costing") },
						]}
					/>
					<Button onClick={() => void exportPdf()}>
						<ArrowDownTrayIcon size={14} />
						{k.slides.exportPdf}
					</Button>
					<Button onClick={() => setPresent(true)}>
						<PlayIcon size={14} />
						{k.slides.present}
					</Button>
				</>
			}
			labels={k.editor}
		>
			{note ? <p className="text-ui text-n-11">{note}</p> : null}
			{failure ? <ErrorNotice error={failure} className="text-ui text-danger-text" /> : null}
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
						: "relative aspect-video w-full overflow-hidden rounded-md border border-n-7",
				)}
			>
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
		</EditorFrame>
	);
}

/** An older Markdown deck: read only, with Present and a Convert that asks an agent for HTML. */
function MarkdownDeck({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	const k = t.knowledge;
	const { ask } = useShell();
	const text = useDeckText(path) ?? "";
	const theme = useSlideTheme().data?.value;
	const [present, setPresent] = useState(false);
	const slides =
		useQuery({
			queryKey: ["knowledge", "deck", text],
			queryFn: () => commands.slideParse(text),
			placeholderData: (prev) => prev,
		}).data?.slides ?? [];
	return (
		<EditorFrame
			title={title}
			refId={`doc:${path}`}
			actions={
				<>
					<Button
						onClick={() => ask(format(k.slides.askConvert, { from: path, to: htmlPath(path) }))}
					>
						<SparklesIcon size={14} />
						{k.slides.convert}
					</Button>
					<Button onClick={() => setPresent(true)} disabled={slides.length === 0}>
						<PlayIcon size={14} />
						{k.slides.present}
					</Button>
				</>
			}
			labels={k.editor}
		>
			{theme ? (
				<Suspense fallback={null}>
					<div className="min-h-0 overflow-auto">
						<SlideDeck
							slides={slides}
							style={theme}
							label={`${k.slides.slides} (${slides.length})`}
							slideLabel={(n) => format(k.slides.slide, { n })}
						/>
					</div>
					{present ? (
						<SlideDeck
							present
							slides={slides}
							style={theme}
							label={k.slides.present}
							slideLabel={(n) => format(k.slides.slide, { n })}
							onLeave={() => setPresent(false)}
						/>
					) : null}
				</Suspense>
			) : null}
		</EditorFrame>
	);
}

/** The face of a Markdown deck in the grid: its first slide on a 16:9 frame in the deck theme. */
function MarkdownThumb({ path }: { path: string }) {
	const theme = useSlideTheme().data?.value;
	const text = useDeckText(path);
	const deck = useQuery({
		queryKey: ["knowledge", "deck", text],
		queryFn: () => commands.slideParse(text ?? ""),
		enabled: text !== undefined,
	}).data;
	const first = (deck?.slides[0] ?? "").split("\n").filter((l) => l.trim());
	const head = first.find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "") ?? deck?.title ?? "";
	const rest = first.filter((l) => !l.startsWith("#")).slice(0, 3);
	return (
		<span
			className="relative flex aspect-video flex-col justify-center gap-1.5 overflow-hidden rounded-md border px-4 shadow-1"
			style={
				theme
					? { background: theme.background, color: theme.text, fontFamily: theme.font }
					: undefined
			}
		>
			<span
				className="absolute inset-x-0 top-0 h-1"
				style={{ background: theme?.accent ?? "var(--accent)" }}
			/>
			<span className="truncate text-16 font-semibold">{head}</span>
			{rest.map((l) => (
				<span key={l} className="truncate text-11 opacity-70">
					{l.replace(/^[-*]\s*/, "")}
				</span>
			))}
			<span className="absolute right-2 bottom-1.5 rounded-full bg-surface-0/70 px-1.5 font-mono text-11 text-n-12">
				{deck?.slides.length ?? 0}
			</span>
		</span>
	);
}

/** The face of an HTML deck: its title. A live frame for each card would run every deck at once. */
function HtmlThumb({ title }: { title: string }) {
	return (
		<span className="relative flex aspect-video items-center overflow-hidden rounded-md border bg-n-12 px-4 text-n-1 shadow-1">
			<span className="absolute inset-x-0 top-0 h-1 bg-accent" />
			<span className="truncate text-16 font-semibold">{title}</span>
		</span>
	);
}

/** Knowledge / Slides: the decks of the repository as a grid (REQ-017). New deck asks an agent. */
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
			base={DOC_DIR.slides}
			rows={rows}
			create={(name) =>
				ask(format(k.askNew, { name, path: `${DOC_DIR.slides}/${slug(name)}.html` }))
			}
			thumb={(row) =>
				isHtml(row.path) ? <HtmlThumb title={row.title} /> : <MarkdownThumb path={row.path} />
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
