import { Menu } from "@base-ui/react/menu";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	type Artifact,
	DESIGN_DIR,
	ofKind,
	slug,
	TEMPLATE,
	useDesignActions,
	useDesignList,
} from "@/lib/design";
import { type BoardFormat, convertBoard, newBoard } from "@/lib/design/convert";
import { format as fill, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { MenuList } from "@/ui/molecules/menu-button";
import { SideSwitch, useSides } from "@/ui/molecules/pane-toggle";
import { Row } from "@/ui/molecules/row";
import { mermaid } from "@/ui/molecules/syntax";
import { BpmnViewer } from "@/ui/organisms/bpmn-viewer";
import { drawioSvg, svgDataUri } from "@/ui/organisms/drawio";
import { DrawioEditor } from "@/ui/organisms/drawio-editor";
import { DrawioViewer } from "@/ui/organisms/drawio-viewer";
import { ExcalidrawBoard } from "@/ui/organisms/excalidraw-board";
import { MermaidView, renderMermaid } from "@/ui/organisms/mermaid-view";
import { LibraryPage, PageColumns, SideCards } from "../library/page-parts";
import { FileFrame, type Frame } from "./frame";
import { useOpenOutside } from "./open";
import {
	Canvas,
	DesignGate,
	Empty,
	fileName,
	ItemList,
	ListNotice,
	Reader,
	TextCard,
	UsedBy,
	useEdit,
	usePage,
} from "./parts";

const EXT = { excalidraw: "excalidraw", mermaid: "mmd", drawio: "drawio", bpmn: "bpmn" } as const;
const FORMATS = ["excalidraw", "drawio", "mermaid", "bpmn"] as const;
const isBoard = (f: string): f is BoardFormat => (FORMATS as readonly string[]).includes(f);

/** The colour of the ghost of a format in the grid. */
const FACE: Record<string, { text: string }> = {
	excalidraw: { text: "text-accent" },
	mermaid: { text: "text-info" },
	drawio: { text: "text-warning" },
	bpmn: { text: "text-success" },
};

/** A ghost of a diagram in the colour of its format: three nodes and two edges. */
function Thumb({ format }: { format: string }) {
	const round = format === "bpmn" || format === "excalidraw";
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 160 80"
			className={`h-20 w-40 ${FACE[format]?.text ?? "text-n-9"}`}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
		>
			<path d="M46 40h24M106 40h12" strokeDasharray={format === "mermaid" ? "3 3" : undefined} />
			<rect x="6" y="28" width="40" height="24" rx={round ? 12 : 4} className="fill-current/15" />
			<rect x="70" y="12" width="36" height="56" rx="4" className="fill-current/10" />
			<rect x="118" y="28" width="36" height="24" rx={round ? 12 : 4} className="fill-current/15" />
		</svg>
	);
}

/**
 * Mermaid sizes its view box before the font is final, so an image of it can cut a node. Measure the
 * drawing in the page and fit the view box to it. A host without layout (a test) keeps the text.
 */
function fitSvg(svg: string): string {
	const host = document.createElement("div");
	host.style.cssText = "position:absolute;left:-9999px;visibility:hidden";
	host.innerHTML = svg;
	document.body.append(host);
	try {
		const el = host.querySelector("svg");
		if (!el || typeof el.getBBox !== "function") return svg;
		const b = el.getBBox();
		if (!b.width || !b.height) return svg;
		el.setAttribute("viewBox", `${b.x - 8} ${b.y - 8} ${b.width + 16} ${b.height + 16}`);
		el.setAttribute("width", String(b.width + 16));
		el.setAttribute("height", String(b.height + 16));
		el.removeAttribute("style");
		return new XMLSerializer().serializeToString(el);
	} finally {
		host.remove();
	}
}

/** The face of a diagram in the grid: the real picture when the app renders the file, else the ghost. */
function Face({ a }: { a: Artifact | undefined }) {
	const format = a?.format ?? "";
	const path = a?.path ?? "";
	const drawn = !!a && !a.issue && ["mermaid", "bpmn", "excalidraw", "drawio"].includes(format);
	const text = useQuery({
		queryKey: ["design", "thumb", path],
		queryFn: () => unwrap(commands.designRead(path)),
		enabled: drawn,
	}).data?.text;
	const scene = useQuery({
		queryKey: ["design", "thumb", path, "svg", text],
		queryFn: async () =>
			format === "drawio"
				? drawioSvg(text ?? "", path.endsWith(".svg"))
				: format === "mermaid"
					? // SVG text labels: an image cannot draw the HTML labels of Mermaid.
						renderMermaid(text ?? "", false, true).then(fitSvg)
					: (await import("@/ui/organisms/excalidraw-canvas")).sceneSvg(text ?? ""),
		enabled: (format === "excalidraw" || format === "drawio" || format === "mermaid") && !!text,
	}).data;
	if (!a || !drawn || !text) return <Thumb format={format} />;
	const box = "pointer-events-none block h-28 w-full overflow-hidden px-2";
	if (format === "bpmn")
		return (
			<span
				aria-hidden="true"
				// inert: the viewer inside holds a focusable node, and the card is a button.
				inert
				className={`${box} [&_[role=img]]:h-28 [&_[role=img]]:min-h-0 [&_[role=img]]:overflow-hidden [&_[role=img]]:border-0 [&_[role=img]]:bg-transparent [&_[role=img]]:p-0 [&_svg]:max-h-28`}
			>
				<BpmnViewer text={text} label={a.title} />
			</span>
		);
	const svg = format === "excalidraw" || format === "drawio" || format === "mermaid" ? scene : text;
	if (!svg) return <Thumb format={format} />;
	return <img alt="" src={svgDataUri(svg)} className="h-28 w-full object-contain px-2" />;
}

/** The open diagram on the canvas. Mermaid has its text beside the picture; a board edits in place. */
function Board({ a, frame, text }: { a: Artifact; frame: Frame; text: boolean }) {
	const { t, lang } = useI18n();
	const { file, error, onError } = frame;
	const format = a.format ?? "";
	const { sides, choose } = useSides(
		"design-diagrams",
		text || file.conflict || error?.line != null,
	);
	const { area, edit } = useEdit(() => sides.editor || choose("both"));
	// "Edit" of the card asks for the text: the focus goes in it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: once, when the diagram opens.
	useEffect(() => {
		if (text && format === "mermaid") edit();
	}, []);
	if (format === "mermaid")
		return (
			<>
				<div className="flex flex-wrap items-center gap-2.5">
					<SideSwitch sides={sides} choose={choose} />
				</div>
				<div ref={area} className="contents">
					<Reader>
						{sides.preview ? (
							<Canvas>
								<div className="flex min-h-0 min-w-0 flex-1 flex-col *:flex-1">
									<MermaidView source={file.text} label={a.title} onError={onError} />
								</div>
							</Canvas>
						) : null}
						{sides.editor ? (
							<TextCard name={fileName(a.path)} save={frame.save}>
								<CodeEditor
									label={t.design.diagram.text}
									value={file.text}
									errorLine={error?.line}
									onChange={file.setText}
									highlight={mermaid}
								/>
							</TextCard>
						) : null}
					</Reader>
				</div>
			</>
		);
	const svg = a.path.endsWith(".svg");
	return (
		<>
			{frame.save ? <div className="flex">{frame.save}</div> : null}
			<Canvas>
				<div className="flex min-h-[520px] min-w-0 flex-1 flex-col *:flex-1">
					{format === "excalidraw" ? (
						<ExcalidrawBoard
							key={file.stamp}
							text={file.saved}
							label={a.title}
							onChange={file.setText}
							onError={onError}
						/>
					) : format === "bpmn" ? (
						<BpmnViewer
							key={file.stamp}
							text={file.saved}
							label={a.title}
							onChange={file.setText}
							onError={onError}
						/>
					) : (
						<DrawioEditor
							key={file.stamp}
							text={file.saved}
							svg={svg}
							label={a.title}
							lang={lang}
							onChange={file.setText}
							fallback={
								<DrawioViewer
									text={file.saved}
									svg={svg}
									label={a.title}
									invalid={t.design.diagram.invalid}
									onError={onError}
								/>
							}
						/>
					)}
				</div>
			</Canvas>
		</>
	);
}

/** The card of the picked diagram, and the actions on it: another format, another app, the assistant. */
function Picked({
	a,
	onOpen,
	onEdit,
	onAsk,
}: {
	a: Artifact;
	onOpen: () => void;
	onEdit: () => void;
	onAsk: () => void;
}) {
	const { t } = useI18n();
	const p = t.design.page;
	const outside = useOpenOutside();
	const act = useDesignActions();
	const [convertError, setConvertError] = useState<string | null>(null);
	const format = a.format ?? "";
	const name = (t.design.formats as Record<string, string>)[format] ?? format;
	// Every format edits. draw.io and BPMN also open in another app (ADR 0015).
	const outsideApp = format === "drawio" || format === "bpmn";
	// A draw.io picture (`.drawio.svg`) has no text to convert.
	const from = isBoard(format) && !a.path.endsWith(".svg") ? format : null;
	// The converted board is a new file beside this one. The source stays as it is.
	const convert = async (to: BoardFormat) => {
		setConvertError(null);
		try {
			const source = await unwrap(commands.designRead(a.path));
			const target = `${a.path.replace(/\.[^./]+$/, "")}.${EXT[to]}`;
			const w = await act.create(target, convertBoard(from as BoardFormat, to, source.text));
			if (w.conflict) setConvertError(fill(t.design.convertExists, { name: target }));
		} catch (e) {
			setConvertError(e instanceof Error ? e.message : String(e));
		}
	};
	const notice = outside.error ?? convertError;
	return (
		<>
			<Card pad className="flex flex-col gap-3.5">
				<Badge className="self-start">{name}</Badge>
				<h2 className="text-30 font-semibold break-words">{a.title}</h2>
				<div className="flex flex-wrap gap-2.5">
					<Button variant="primary" className="flex-[1_1_110px]" onClick={onOpen}>
						{p.open}
					</Button>
					<RightButton right="design.edit" className="flex-[1_1_110px]" onClick={onEdit}>
						{p.edit}
					</RightButton>
				</div>
				{notice ? (
					<p role="alert" className="text-danger-text">
						{notice}
					</p>
				) : null}
			</Card>
			<Card className="py-2">
				<section aria-label={p.actions}>
					<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{p.actions}</h2>
					{from ? (
						<Row>
							<span className="font-semibold">{p.changeFormat}</span>
							<span className="ml-auto">
								<Menu.Root>
									<Menu.Trigger render={<Button aria-label={`${p.changeFormat}: ${name}`} />}>
										{name}
									</Menu.Trigger>
									<MenuList
										items={FORMATS.filter((f) => f !== from).map((f) => ({
											id: f,
											label: t.design.formats[f],
											onSelect: () => void convert(f),
										}))}
									/>
								</Menu.Root>
							</span>
						</Row>
					) : null}
					{outsideApp ? (
						<Row>
							<span className="font-semibold">{t.design.openOutside}</span>
							<Button
								className="ml-auto"
								aria-label={t.design.openOutside}
								onClick={() => void outside.open(a.path)}
							>
								{p.open}
							</Button>
						</Row>
					) : null}
					<Row
						render={(r) => (
							<button
								type="button"
								onClick={onAsk}
								{...r}
								className={cn(r.className, "w-full cursor-pointer text-left font-semibold")}
							/>
						)}
					>
						{p.ask}
						<Avatar agent size="s" name={p.assistant} className="ml-auto" />
					</Row>
				</section>
			</Card>
			<UsedBy refId={a.reference} />
		</>
	);
}

/**
 * Library / Diagrams: Excalidraw, draw.io, Mermaid and BPMN files (REQ-003 to REQ-005). The page
 * opens on the grid of previews; the right column holds the picked diagram. "Open" and "Edit" put
 * the diagram on the canvas in place of the grid.
 */
export function Diagrams() {
	const { t } = useI18n();
	const p = t.design.page;
	const title = t.tabs.design.diagrams;
	const { ask } = useShell();
	const list = useDesignList().data;
	const act = useDesignActions();
	const arts = ofKind(list, "diagram");
	const { diagramFormat } = usePrefs();
	// The format of the preference comes first: the form starts on it.
	const first = isBoard(diagramFormat) ? diagramFormat : FORMATS[0];
	const formats = [first, ...FORMATS.filter((f) => f !== first)];
	const formatName = (a: Artifact) =>
		(t.design.formats as Record<string, string>)[a.format ?? ""] ?? a.format;
	const items = arts.map((a) => ({
		ref: a.reference,
		title: a.title,
		issue: a.issue,
		path: a.path,
	}));
	const page = usePage(
		title,
		items,
		{
			formats: formats.map((f) => ({ value: f, label: t.design.formats[f] })),
			run: async (name, format) => {
				const f = format as BoardFormat;
				const s = slug(name);
				await act.create(
					`${DESIGN_DIR.diagram}/${s}.${EXT[f]}`,
					f === "excalidraw" || f === "mermaid" ? TEMPLATE[f] : newBoard(f),
				);
				return `diagram:${s}`;
			},
		},
		p.newDiagram,
	);
	const [view, setView] = useState<"grid" | "list">("grid");
	const [query, setQuery] = useState("");
	// The diagram on the canvas, and whether "Edit" asked for it.
	const [open, setOpen] = useState<{ ref: string; text: boolean } | null>(null);
	const a = arts.find((x) => x.reference === page.selected);
	// A diagram that the person just made opens on its text.
	const shown = a && (open?.ref === a.reference || page.created === a.reference);
	const q = query.trim().toLowerCase();
	const found = items.filter((i) => i.title.toLowerCase().includes(q));
	const pills = (ref: string) => {
		const x = arts.find((y) => y.reference === ref);
		return x ? <Badge>{formatName(x)}</Badge> : null;
	};
	return (
		<DesignGate title={title}>
			<LibraryPage
				title={title}
				action={
					arts.length ? (
						<>
							<div className="w-36">
								<Segmented
									label={t.editing.view.label}
									value={view}
									onValueChange={(v) => {
										setView(v);
										setOpen(null);
									}}
									items={[
										{ value: "grid", label: t.design.view.grid },
										{ value: "list", label: t.design.view.list },
									]}
								/>
							</div>
							<Button variant="primary" onClick={() => ask(p.drawPrompt)}>
								{p.draw}
							</Button>
						</>
					) : undefined
				}
				menu={page.pageMenu(page.open)}
			>
				{page.dialogs}
				<ListNotice />
				{arts.length === 0 ? (
					<Empty label={p.newDiagram} onAdd={() => page.add()} />
				) : (
					<>
						<div className="flex flex-wrap items-center gap-2.5">
							<div className="mr-auto w-80 max-w-full">
								<Input
									label={p.findDiagram}
									placeholder={p.findDiagram}
									type="search"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
								/>
							</div>
							<fieldset aria-label={p.new} className="contents">
								<span className="text-n-11">{p.new}</span>
								{formats.map((f) => (
									<RightButton key={f} right="design.edit" onClick={() => page.add(f)}>
										{t.design.formats[f]}
									</RightButton>
								))}
							</fieldset>
						</div>
						<PageColumns>
							<div className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
								{shown ? (
									<>
										<Button className="self-start" onClick={() => setOpen(null)}>
											{p.allDiagrams}
										</Button>
										<FileFrame key={a.path} path={a.path} issue={a.issue}>
											{(frame) => (
												<>
													{frame.alerts}
													<Board
														a={a}
														frame={frame}
														text={open?.text || page.created === a.reference}
													/>
												</>
											)}
										</FileFrame>
									</>
								) : view === "list" ? (
									<ItemList
										label={title}
										items={found}
										selected={page.selected}
										onPick={page.pick}
										menuOf={page.menuOf}
										pills={(i) => pills(i.ref)}
									/>
								) : (
									<ul
										aria-label={title}
										className="grid grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-3.5"
									>
										{found.map((i) => (
											<li key={i.ref}>
												<ContextMenu items={page.menuOf(i)}>
													<button
														type="button"
														aria-pressed={i.ref === page.selected}
														onClick={() => page.pick(i.ref)}
														className={cn(
															"flex w-full cursor-pointer flex-col items-start gap-3 rounded-lg bg-surface-2 p-4.5 text-left text-n-12 shadow-2 focus-visible:outline-offset-2",
															i.ref === page.selected && "bg-accent-tint outline-2 outline-accent",
														)}
													>
														<span className="flex h-[150px] w-full items-center justify-center overflow-hidden rounded-[14px] border border-dashed border-n-8 bg-n-2">
															<Face a={arts.find((x) => x.reference === i.ref)} />
														</span>
														<span className="max-w-full text-17 font-semibold break-words">
															{i.title}
														</span>
														<span className="flex flex-wrap gap-1.5">
															{i.issue ? (
																<Badge variant="danger">{t.design.unreadable}</Badge>
															) : null}
															{pills(i.ref)}
														</span>
													</button>
												</ContextMenu>
											</li>
										))}
									</ul>
								)}
							</div>
							{a ? (
								<SideCards className="flex-[2_1_300px]">
									<Picked
										key={a.path}
										a={a}
										onOpen={() => setOpen({ ref: a.reference, text: false })}
										onEdit={() => setOpen({ ref: a.reference, text: true })}
										onAsk={() => page.askChange({ ref: a.reference, title: a.title, path: a.path })}
									/>
								</SideCards>
							) : null}
						</PageColumns>
					</>
				)}
			</LibraryPage>
		</DesignGate>
	);
}
