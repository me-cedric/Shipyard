import { useQuery } from "@tanstack/react-query";
import { dataUri } from "@/lib/data-uri";
import { type Screen, slug, TEMPLATE, useDesignActions, useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ComputerDesktopIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { RefChip } from "@/ui/molecules/ref-chip";
import { svgDataUri } from "@/ui/organisms/drawio";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { HtmlPreview } from "@/ui/organisms/html-preview";
import { FigmaPanel } from "./figma-panel";
import { FileFrame } from "./frame";
import { useOpenOutside } from "./open";
import { ArtifactTab } from "./tab";
import { TokenView } from "./tokens";

const IMAGE: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

/** The inline preview of an HTML mockup or an image of the folder. Other files show nothing. */
function Preview({ path, label }: { path: string; label: string }) {
	const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	const mime = IMAGE[ext];
	const html = ext === "html" || ext === "htm";
	const fig = ext === "fig";
	const q = useQuery({
		queryKey: ["design", "preview", path],
		enabled: html || fig || ext === "svg" || !!mime,
		queryFn: async () => {
			if (fig) {
				// A .fig file shows the preview that Figma saved in it.
				const v = await unwrap(commands.designFigView(path));
				return v.thumbnail ? dataUri("image/png", v.thumbnail) : "";
			}
			return mime
				? dataUri(mime, await unwrap(commands.designBytes(path)))
				: (await unwrap(commands.designRead(path))).text;
		},
	});
	if (q.error) return <ErrorNotice error={q.error} />;
	if (!q.data) return null;
	if (html) return <HtmlPreview html={q.data} label={label} />;
	return (
		<img
			src={ext === "svg" ? svgDataUri(q.data) : q.data}
			alt={label}
			className="max-h-[70vh] max-w-full self-start rounded-md border border-n-7"
		/>
	);
}

/** One screen: its artifacts and its design file. A local link that does not exist shows broken (REQ-019). */
function ScreenView({ screen }: { screen: Screen }) {
	const { t } = useI18n();
	const s = t.design.screens;
	const figma = t.editing.openFigma;
	const { openRef } = useShell();
	const outside = useOpenOutside();
	return (
		<EditorFrame
			title={screen.title}
			refId={`screen:${screen.slug}`}
			error={outside.error ? { message: outside.error } : null}
			labels={t.design.frame}
		>
			<div className="flex flex-col gap-4">
				<section aria-label={s.artifacts} className="flex flex-col gap-1">
					<h3 className="text-12 font-medium text-n-11">{s.artifacts}</h3>
					<ul className="flex flex-wrap gap-1">
						{screen.artifacts.map((r) => (
							<li key={r}>
								<RefChip refId={r} state="resolved" onOpen={openRef} />
							</li>
						))}
					</ul>
				</section>
				{screen.file ? (
					<section aria-label={s.file} className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<h3 className="text-12 font-medium text-n-11">{s.file}</h3>
							<span className="font-mono text-12">{screen.file}</span>
							{screen.file.toLowerCase().endsWith(".fig") ? (
								<Button variant="primary" onClick={() => void outside.open(screen.file ?? "")}>
									{figma}
								</Button>
							) : (
								<Button onClick={() => void outside.open(screen.file ?? "")}>{s.openFigma}</Button>
							)}
						</div>
						<Preview path={screen.file} label={screen.title} />
					</section>
				) : null}
				<section aria-label={s.figma} className="flex items-center gap-2">
					<h3 className="text-12 font-medium text-n-11">{s.figma}</h3>
					{screen.figma ? (
						<>
							<span className="font-mono text-12">{screen.figma}</span>
							{screen.broken ? (
								<Badge variant="danger">{s.broken}</Badge>
							) : (
								<Button variant="primary" onClick={() => void outside.open(screen.figma ?? "")}>
									{figma}
								</Button>
							)}
						</>
					) : (
						<span className="text-ui text-n-11">{s.none}</span>
					)}
				</section>
				<FigmaPanel file={screen.figma?.startsWith("https://") ? screen.figma : null} />
			</div>
		</EditorFrame>
	);
}

/** Design / Screens: the screens with their artifacts and design files, and the design doc (REQ-019, REQ-021). */
export function Screens() {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const screens = list?.screens ?? [];
	const doc = list?.doc ?? "";
	// The screens file sits beside the design doc.
	const file = doc.replace(/[^/]*$/, "screens.json");
	return (
		<ArtifactTab
			title={t.tabs.design.screens}
			icon={<ComputerDesktopIcon size={16} />}
			noun={t.design.noun.screen}
			notice={list?.screensError}
			pinned={doc ? { ref: `doc:${doc}`, title: t.design.screens.doc } : undefined}
			rows={screens.map((s) => ({
				ref: `screen:${s.slug}`,
				title: s.title,
				tag: s.broken ? t.design.screens.broken : null,
				tone: s.broken ? "danger" : undefined,
			}))}
			create={{
				run: async (name) => {
					await act.addScreen(file, name);
					return `screen:${slug(name)}`;
				},
			}}
		>
			{(row) => {
				const screen = screens.find((s) => `screen:${s.slug}` === row.ref);
				return screen ? (
					<ScreenView screen={screen} />
				) : (
					<FileFrame path={doc} refId={row.ref} title={row.title} missing={TEMPLATE.doc}>
						{(f) => (
							<div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1 gap-3">
								<CodeEditor label={t.design.screens.docText} value={f.text} onChange={f.setText} />
								<TokenView />
							</div>
						)}
					</FileFrame>
				);
			}}
		</ArtifactTab>
	);
}
