import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { Button } from "@/ui/atoms/button";
import { ShareIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { MenuButton } from "@/ui/molecules/menu-button";
import { BpmnViewer } from "@/ui/organisms/bpmn-viewer";
import { svgDataUri } from "@/ui/organisms/drawio";
import { DrawioEditor } from "@/ui/organisms/drawio-editor";
import { DrawioViewer } from "@/ui/organisms/drawio-viewer";
import { ExcalidrawBoard } from "@/ui/organisms/excalidraw-board";
import { MermaidView } from "@/ui/organisms/mermaid-view";
import { FileFrame } from "./frame";
import { useOpenOutside } from "./open";
import { ArtifactTab } from "./tab";

const EXT = { excalidraw: "excalidraw", mermaid: "mmd", drawio: "drawio", bpmn: "bpmn" } as const;
const FORMATS = ["excalidraw", "mermaid", "drawio", "bpmn"] as const;
const isBoard = (f: string): f is BoardFormat => (FORMATS as readonly string[]).includes(f);

/** The tint and the shape of a format in the grid. */
const FACE: Record<string, { tone: "accent" | "info" | "warning" | "success"; text: string }> = {
	excalidraw: { tone: "accent", text: "text-accent" },
	mermaid: { tone: "info", text: "text-info" },
	drawio: { tone: "warning", text: "text-warning" },
	bpmn: { tone: "success", text: "text-success" },
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

/** The face of a diagram in the grid: the real picture when the app renders the file, else the ghost. */
function Face({ a }: { a: Artifact | undefined }) {
	const format = a?.format ?? "";
	const path = a?.path ?? "";
	const drawn =
		!!a &&
		!a.issue &&
		(["mermaid", "bpmn", "excalidraw"].includes(format) ||
			(format === "drawio" && path.endsWith(".svg")));
	const text = useQuery({
		queryKey: ["design", "thumb", path],
		queryFn: () => unwrap(commands.designRead(path)),
		enabled: drawn,
	}).data?.text;
	const scene = useQuery({
		queryKey: ["design", "thumb", path, "svg", text],
		queryFn: async () => (await import("@/ui/organisms/excalidraw-canvas")).sceneSvg(text ?? ""),
		enabled: format === "excalidraw" && !!text,
	}).data;
	if (!a || !drawn || !text) return <Thumb format={format} />;
	const box = "pointer-events-none block h-28 w-full overflow-hidden px-2";
	if (format === "mermaid" || format === "bpmn")
		return (
			<span
				aria-hidden="true"
				className={`${box} [&_[role=img]]:h-28 [&_[role=img]]:min-h-0 [&_[role=img]]:overflow-hidden [&_[role=img]]:border-0 [&_[role=img]]:bg-transparent [&_[role=img]]:p-0 [&_svg]:max-h-28`}
			>
				{format === "mermaid" ? (
					<MermaidView source={text} label={a.title} />
				) : (
					<BpmnViewer text={text} label={a.title} />
				)}
			</span>
		);
	const svg = format === "excalidraw" ? scene : text;
	if (!svg) return <Thumb format={format} />;
	return <img alt="" src={svgDataUri(svg)} className="h-28 w-full object-contain px-2" />;
}

function Diagram({ a }: { a: Artifact }) {
	const { t, lang } = useI18n();
	const outside = useOpenOutside();
	const act = useDesignActions();
	const [convertError, setConvertError] = useState<string | null>(null);
	const format = a.format ?? "";
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
	return (
		<FileFrame
			path={a.path}
			refId={a.reference}
			title={a.title}
			issue={a.issue}
			notice={outside.error ?? convertError}
			actions={
				<>
					{from ? (
						<MenuButton
							label={t.design.convert}
							items={FORMATS.filter((f) => f !== from).map((f) => ({
								id: f,
								label: t.design.formats[f],
								onSelect: () => void convert(f),
							}))}
						/>
					) : null}
					{outsideApp ? (
						<Button onClick={() => void outside.open(a.path)}>{t.design.openOutside}</Button>
					) : null}
				</>
			}
		>
			{(file, onError, error) => {
				if (format === "excalidraw")
					return (
						<ExcalidrawBoard
							key={file.stamp}
							text={file.saved}
							label={a.title}
							onChange={file.setText}
							onError={onError}
						/>
					);
				if (format === "mermaid")
					return (
						<div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1 gap-3">
							<CodeEditor
								label={t.design.diagram.text}
								value={file.text}
								errorLine={error?.line}
								onChange={file.setText}
							/>
							<div className="h-full min-h-0">
								<MermaidView source={file.text} label={a.title} onError={onError} />
							</div>
						</div>
					);
				if (format === "bpmn")
					return (
						<BpmnViewer
							key={file.stamp}
							text={file.saved}
							label={a.title}
							onChange={file.setText}
							onError={onError}
						/>
					);
				const svg = a.path.endsWith(".svg");
				return (
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
				);
			}}
		</FileFrame>
	);
}

/** Design / Diagrams: Excalidraw, draw.io, Mermaid and BPMN files (REQ-003 to REQ-005). */
export function Diagrams() {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const rows = ofKind(list, "diagram");
	const { diagramFormat } = usePrefs();
	// The format of the preference comes first: the form starts on it.
	const first = isBoard(diagramFormat) ? diagramFormat : FORMATS[0];
	return (
		<ArtifactTab
			title={t.tabs.design.diagrams}
			icon={<ShareIcon size={16} />}
			noun={t.design.noun.diagram}
			rows={rows.map((a) => ({
				ref: a.reference,
				title: a.title,
				tag: (t.design.formats as Record<string, string>)[a.format ?? ""] ?? a.format,
				tone: FACE[a.format ?? ""]?.tone,
				issue: a.issue,
			}))}
			thumb={(row) => <Face a={rows.find((x) => x.reference === row.ref)} />}
			create={{
				formats: [first, ...FORMATS.filter((f) => f !== first)].map((f) => ({
					value: f,
					label: t.design.formats[f],
				})),
				run: async (name, format) => {
					const f = format as BoardFormat;
					const s = slug(name);
					await act.create(
						`${DESIGN_DIR.diagram}/${s}.${EXT[f]}`,
						f === "excalidraw" || f === "mermaid" ? TEMPLATE[f] : newBoard(f),
					);
					return `diagram:${s}`;
				},
			}}
		>
			{(row) => {
				const a = rows.find((x) => x.reference === row.ref);
				return a ? <Diagram a={a} /> : null;
			}}
		</ArtifactTab>
	);
}
