import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { DOC_DIR, useDocFile, useDocList, useSlideTheme } from "@/lib/knowledge";
import { Button } from "@/ui/atoms/button";
import { PlayIcon, PresentationChartIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { ListTab } from "./list-tab";

// reveal.js loads on the first deck, not on the first screen.
const SlideDeck = lazy(() =>
	import("@/ui/organisms/slide-deck").then((m) => ({ default: m.SlideDeck })),
);

const TEMPLATE = (name: string) => `# ${name}\n\n---\n\n## Slide\n\n- Point\n`;

/** One deck: the text with a live preview, and the present mode (REQ-017 to REQ-019). */
function DeckEditor({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	const k = t.knowledge;
	const file = useDocFile(path);
	const theme = useSlideTheme().data?.value;
	const [present, setPresent] = useState(false);
	// The Rust parser splits the slides: the app holds no copy of the rule.
	const deck = useQuery({
		queryKey: ["knowledge", "deck", file.text],
		queryFn: () => commands.slideParse(file.text),
		placeholderData: (prev) => prev,
	}).data;
	const slides = deck?.slides ?? [];
	return (
		<EditorFrame
			title={title}
			refId={`doc:${path}`}
			actions={
				<Button onClick={() => setPresent(true)} disabled={slides.length === 0}>
					<PlayIcon size={14} />
					{k.slides.present}
				</Button>
			}
			primary={{ label: k.editor.save, onClick: () => void file.save(), disabled: !file.dirty }}
			save={file.conflict ? "conflict" : file.dirty ? "dirty" : "clean"}
			error={file.error ? { message: file.error } : null}
			onReload={() => void file.reload()}
			onKeepMine={() => void file.keepMine()}
			labels={k.editor}
		>
			<Suspense fallback={null}>
				<div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1 gap-3">
					<CodeEditor label={k.editor.text} value={file.text} onChange={file.setText} />
					{theme ? (
						<div className="min-h-0 overflow-auto">
							<SlideDeck
								slides={slides}
								style={theme}
								label={`${k.slides.slides} (${slides.length})`}
								slideLabel={(n) => format(k.slides.slide, { n })}
							/>
						</div>
					) : null}
				</div>
				{present && theme ? (
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
		</EditorFrame>
	);
}

/** The face of a deck in the grid: its first slide on a 16:9 frame in the deck theme, and the count. */
function DeckThumb({ path }: { path: string }) {
	const theme = useSlideTheme().data?.value;
	const text = useQuery({
		queryKey: ["knowledge", "thumb", path],
		queryFn: () => unwrap(commands.docReadOne(path)),
	}).data?.text;
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

/** Knowledge / Slides: the decks of the repository as a grid, one theme for all (REQ-017). */
export function Slides() {
	const { t } = useI18n();
	const k = t.knowledge.slides;
	const rows = useDocList().data?.slides;
	return (
		<ListTab
			title={k.title}
			icon={<PresentationChartIcon size={16} />}
			noun={k.newDeck}
			nameLabel={k.name}
			base={DOC_DIR.slides}
			rows={rows}
			template={TEMPLATE}
			thumb={(row) => <DeckThumb path={row.path} />}
		>
			{(row) => <DeckEditor path={row.path} title={row.title} />}
		</ListTab>
	);
}
