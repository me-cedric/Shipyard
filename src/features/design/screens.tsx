import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { dataUri } from "@/lib/data-uri";
import { type Screen, slug, TEMPLATE, useDesignActions, useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { LinkIcon } from "@/ui/icons";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { EditorPreview } from "@/ui/molecules/pane-toggle";
import { RefChip } from "@/ui/molecules/ref-chip";
import { Row } from "@/ui/molecules/row";
import { SectionSwitch } from "@/ui/molecules/section-switch";
import { TILE, TILE_ON } from "@/ui/molecules/tile";
import { svgDataUri } from "@/ui/organisms/drawio";
import { HtmlPreview } from "@/ui/organisms/html-preview";
import { ZoomFrame } from "@/ui/organisms/zoom-frame";
import { LibraryPage, LinkedCard, PageColumns, SideCards } from "@/ui/templates/library-page";
import { FigmaPanel } from "./figma-panel";
import { FileFrame } from "./frame";
import { useOpenOutside } from "./open";
import { DesignGate, Empty, ListNotice, usePage } from "./parts";
import { COLOR, TokenView, useTokens } from "./tokens";

const IMAGE: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

/** The inline preview of an HTML mockup or an image of the folder. Other files show nothing. */
function Preview({ path, label, plain }: { path: string; label: string; plain?: boolean }) {
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
	if (q.isLoading) return <Loading rows={2} />;
	if (!q.data) return null;
	// The card of a screen shows the bare picture; the detail has the frame and the zoom.
	if (plain)
		return html ? null : (
			<img
				src={ext === "svg" ? svgDataUri(q.data) : q.data}
				alt=""
				className="size-full object-contain"
			/>
		);
	if (html) return <HtmlPreview html={q.data} label={label} />;
	const src = ext === "svg" ? svgDataUri(q.data) : q.data;
	return (
		<ZoomFrame label={label} className="rounded-md border border-n-7">
			<img src={src} alt={label} className="w-full rounded-md" />
		</ZoomFrame>
	);
}

/** One screen: its artifacts and its design file. A local link that does not exist shows broken (REQ-019). */
function ScreenView({ screen }: { screen: Screen }) {
	const { t } = useI18n();
	const s = t.design.screens;
	const figma = t.editing.openFigma;
	const { openRef } = useShell();
	const outside = useOpenOutside();
	const connected = useQuery({
		queryKey: ["figma", "token"],
		queryFn: () => unwrap(commands.figmaTokenState()),
	}).data;
	return (
		<Card className="flex flex-col gap-4 p-6">
			<h2 className="text-20 font-semibold">{screen.title}</h2>
			<ErrorNotice error={outside.error} />
			<section aria-label={s.artifacts} className="flex flex-col gap-1">
				<h3 className="text-13 font-semibold text-n-11">{s.artifacts}</h3>
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
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-13 font-semibold text-n-11">{s.file}</h3>
						<span className="font-mono text-13">{screen.file}</span>
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
			<section aria-label={s.figma} className="flex flex-wrap items-center gap-2">
				<h3 className="text-13 font-semibold text-n-11">{s.figma}</h3>
				{screen.figma ? (
					<>
						<span className="font-mono text-13">{screen.figma}</span>
						{screen.broken ? (
							<Badge variant="danger">{s.broken}</Badge>
						) : (
							<Button variant="primary" onClick={() => void outside.open(screen.figma ?? "")}>
								{figma}
							</Button>
						)}
					</>
				) : (
					<span className="text-n-11">{s.none}</span>
				)}
			</section>
			{connected ? (
				<FigmaPanel file={screen.figma?.startsWith("https://") ? screen.figma : null} />
			) : null}
		</Card>
	);
}

/** One screen as a card: its preview, its name and whether it is built. */
function ScreenTile({
	screen,
	selected,
	onPick,
}: {
	screen: Screen;
	selected: boolean;
	onPick: () => void;
}) {
	const { t } = useI18n();
	const p = t.design.page;
	const built = screen.artifacts.length > 0;
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onPick}
			className={cn(TILE, "w-full items-start", selected && TILE_ON)}
		>
			{/* No picture, no box: an empty dashed frame with no words looks broken. */}
			{screen.file && /\.(png|jpe?g|gif|webp|svg)$/i.test(screen.file) ? (
				<span className="flex h-[170px] w-full items-center justify-center overflow-hidden rounded-field border border-dashed border-n-8 bg-n-2">
					<Preview path={screen.file} label={screen.title} plain />
				</span>
			) : null}
			<span className="max-w-full break-words text-17 font-semibold">{screen.title}</span>
			<span className="flex flex-wrap gap-1.5">
				<Badge
					variant={built ? "success" : undefined}
					title={screen.broken ? t.design.screens.broken : undefined}
				>
					{built ? p.built : p.notBuilt}
					{screen.broken ? <span className="sr-only">, {t.design.screens.broken}</span> : null}
				</Badge>
			</span>
		</button>
	);
}

const SIZE = /^([\d.]+)(px|rem|em)$/;
const px = (v: string) => {
	const m = SIZE.exec(v.trim());
	return m ? Number(m[1]) * (m[2] === "px" ? 1 : 16) : null;
};

/** The cards "Colours" and "Type sizes": the first tokens of the project. "All tokens" opens them. */
function TokenCards({ onAll }: { onAll: () => void }) {
	const { t } = useI18n();
	const p = t.design.page;
	const tokens = (useTokens().data ?? []).flatMap((f) => f.tokens);
	const colours = tokens.filter((x) => COLOR.test(x.value)).slice(0, 4);
	const sizes = tokens
		.filter((x) => /font|text|size|type|heading/i.test(x.name) && px(x.value) !== null)
		.slice(0, 3);
	if (colours.length === 0 && sizes.length === 0) return null;
	return (
		<SideCards className="flex-[2_1_300px]">
			{colours.length ? (
				<LinkedCard title={p.colours}>
					<ul>
						{colours.map((x) => (
							<li key={x.name} className="[&+&]:border-t [&+&]:border-n-6">
								<Row>
									<span
										aria-hidden="true"
										className="size-8 shrink-0 rounded-md border border-n-6"
										style={{ background: x.value }}
									/>
									<span className="min-w-0 break-all font-semibold">{x.name}</span>
									<span className="ml-auto font-mono text-n-11">{x.value}</span>
								</Row>
							</li>
						))}
					</ul>
				</LinkedCard>
			) : null}
			<LinkedCard title={p.typeSizes}>
				<ul>
					{sizes.map((x) => (
						<li key={x.name} className="[&+&]:border-t [&+&]:border-n-6">
							<Row>
								<span
									aria-hidden="true"
									className="font-semibold leading-none"
									style={{ fontSize: Math.min(px(x.value) ?? 16, 32) }}
								>
									Aa
								</span>
								<span className="min-w-0 break-all font-semibold">{x.name}</span>
								<span className="ml-auto font-mono text-n-11">{x.value}</span>
							</Row>
						</li>
					))}
				</ul>
				<div className="border-t border-n-6">
					<Row render={(rp) => <button type="button" onClick={onAll} {...rp} />}>
						<span className="font-semibold text-accent-text">{p.allTokens}</span>
					</Row>
				</div>
			</LinkedCard>
		</SideCards>
	);
}

/** The banner while Figma has no token: "Connect Figma" shows the token form, "Not now" hides it. */
function FigmaBanner() {
	const { t } = useI18n();
	const p = t.design.page;
	const [hidden, setHidden] = useState(false);
	const [connect, setConnect] = useState(false);
	const connected = useQuery({
		queryKey: ["figma", "token"],
		queryFn: () => unwrap(commands.figmaTokenState()),
	}).data;
	if (connected !== false || hidden) return null;
	return (
		<AttentionCard
			head={
				<div className="flex flex-wrap items-center gap-4">
					<LinkIcon size={28} aria-hidden="true" />
					<h2 className="min-w-60 flex-1 text-20 font-semibold">{p.figmaOff}</h2>
					<Button onClick={() => setHidden(true)}>{p.notNow}</Button>
					<Button variant="primary" onClick={() => setConnect(true)}>
						{p.connectFigma}
					</Button>
				</div>
			}
		>
			{connect ? <FigmaPanel /> : null}
		</AttentionCard>
	);
}

/** The text of the design doc beside its tokens, in the Tokens mode. */
function TokenDoc({ doc }: { doc: string }) {
	const { t } = useI18n();
	return (
		<FileFrame path={doc} missing={TEMPLATE.doc}>
			{(f) => (
				<>
					{f.alerts}
					<div className="flex min-h-[420px] flex-col gap-2">
						<div className="flex">{f.save}</div>
						<EditorPreview
							id="design-screens-width"
							label={t.design.resize.editor}
							// The starter block of the tokens goes in the text: the text shows.
							needText={f.file.dirty || f.file.conflict}
							editor={
								<CodeEditor
									label={t.design.screens.docText}
									value={f.file.text}
									onChange={f.file.setText}
								/>
							}
							preview={
								<div className="flex min-h-0 min-w-0 flex-1 flex-col *:min-h-0 *:flex-1">
									<TokenView
										onAdd={() =>
											f.file.setText(`${f.file.text.trimEnd()}\n\n${t.design.screens.tokenStarter}`)
										}
									/>
								</div>
							}
						/>
					</div>
				</>
			)}
		</FileFrame>
	);
}

/** Library / Screens: the screens as cards, the tokens, the design doc (REQ-019, REQ-021). */
export function Screens() {
	const { t } = useI18n();
	const p = t.design.page;
	const list = useDesignList().data;
	const act = useDesignActions();
	const [mode, setMode] = useState<"screens" | "tokens">("screens");
	const screens = list?.screens ?? [];
	const doc = list?.doc ?? "";
	// The screens file sits beside the design doc.
	const file = doc.replace(/[^/]*$/, "screens.json");
	const items = screens.map((s) => ({
		ref: `screen:${s.slug}`,
		title: s.title,
		path: s.file ?? undefined,
	}));
	const page = usePage(
		t.tabs.design.screens,
		items,
		{
			run: async (name) => {
				await act.addScreen(file, name);
				return `screen:${slug(name)}`;
			},
		},
		p.addScreen,
	);
	// The detail opens on a pick, not before: the cards show none selected at first.
	const [opened, setOpened] = useState<string | null>(null);
	const open = screens.find((s) => `screen:${s.slug}` === opened);
	// "Design to code" works on the open screen, else on the first one.
	const target = open ?? screens[0];
	return (
		<DesignGate title={t.tabs.design.screens}>
			<LibraryPage
				title={t.tabs.design.screens}
				action={
					<>
						<SectionSwitch
							label={t.editing.view.label}
							items={[
								{ id: "screens", label: t.tabs.design.screens, current: mode === "screens" },
								{ id: "tokens", label: t.design.screens.tokens, current: mode === "tokens" },
							]}
							onSelect={(id) => setMode(id as "screens" | "tokens")}
						/>
						<RightButton right="design.edit" onClick={() => page.add()}>
							{p.addScreen}
						</RightButton>
						<Button
							variant="primary"
							disabled={!target}
							onClick={() => target && page.pick(`screen:${target.slug}`)}
						>
							{p.toCode}
						</Button>
					</>
				}
				menu={page.pageMenu(page.open)}
			>
				{page.dialogs}
				<ListNotice notice={list?.screensError} />
				<FigmaBanner />
				{mode === "tokens" ? (
					doc ? (
						<TokenDoc doc={doc} />
					) : null
				) : screens.length === 0 ? (
					<Empty label={p.addScreen} onAdd={() => page.add()} />
				) : (
					<>
						<PageColumns>
							<ul
								aria-label={t.tabs.design.screens}
								className="grid min-w-0 flex-[3_1_520px] grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-4"
							>
								{screens.map((s) => {
									const ref = `screen:${s.slug}`;
									const item = items.find((i) => i.ref === ref);
									return (
										<li key={ref}>
											<ContextMenu items={item ? page.menuOf(item) : []}>
												<ScreenTile
													screen={s}
													selected={ref === opened}
													onPick={() => {
														setOpened(ref);
														page.pick(ref);
													}}
												/>
											</ContextMenu>
										</li>
									);
								})}
							</ul>
							<TokenCards onAll={() => setMode("tokens")} />
						</PageColumns>
						{open ? <ScreenView screen={open} /> : null}
					</>
				)}
			</LibraryPage>
		</DesignGate>
	);
}
