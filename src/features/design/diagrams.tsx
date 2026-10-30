import { useQuery } from "@tanstack/react-query";
import {
	type Artifact,
	DESIGN_DIR,
	ofKind,
	slug,
	TEMPLATE,
	useDesignActions,
	useDesignList,
} from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ShareIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { BpmnViewer } from "@/ui/organisms/bpmn-viewer";
import { DrawioViewer } from "@/ui/organisms/drawio-viewer";
import { ExcalidrawBoard } from "@/ui/organisms/excalidraw-board";
import { MermaidView } from "@/ui/organisms/mermaid-view";
import { FileFrame } from "./frame";
import { useOpenOutside } from "./open";
import { ArtifactTab } from "./tab";

const EXT = { excalidraw: "excalidraw", mermaid: "mmd" } as const;

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

/** The face of a diagram in the grid: the real picture when the app renders the format, else the ghost. */
function Face({ a }: { a: Artifact | undefined }) {
	const mermaid = a?.format === "mermaid" && !a.issue;
	const text = useQuery({
		queryKey: ["design", "thumb", a?.path],
		queryFn: () => unwrap(commands.designRead(a?.path ?? "")),
		enabled: mermaid,
	}).data?.text;
	if (!mermaid || !text) return <Thumb format={a?.format ?? ""} />;
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none block h-28 w-full overflow-hidden px-2 [&_[role=img]]:min-h-0 [&_[role=img]]:overflow-hidden [&_[role=img]]:border-0 [&_[role=img]]:bg-transparent [&_[role=img]]:p-0 [&_svg]:max-h-28"
		>
			<MermaidView source={text} label={a.title} />
		</span>
	);
}

function Diagram({ a }: { a: Artifact }) {
	const { t } = useI18n();
	const outside = useOpenOutside();
	const format = a.format ?? "";
	// Q-040: Excalidraw and Mermaid edit. draw.io and BPMN show, and open in another app.
	const readOnly = format === "drawio" || format === "bpmn";
	return (
		<FileFrame
			path={a.path}
			refId={a.reference}
			title={a.title}
			issue={a.issue}
			readOnly={readOnly}
			notice={outside.error}
			actions={
				readOnly ? (
					<Button onClick={() => void outside.open(a.path)}>{t.design.openOutside}</Button>
				) : undefined
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
					return <BpmnViewer text={file.saved} label={a.title} onError={onError} />;
				return (
					<DrawioViewer
						text={file.saved}
						svg={a.path.endsWith(".svg")}
						label={a.title}
						invalid={t.design.diagram.invalid}
						onError={onError}
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
				formats: (["excalidraw", "mermaid"] as const).map((f) => ({
					value: f,
					label: t.design.formats[f],
				})),
				run: async (name, format) => {
					const f = format as keyof typeof EXT;
					const s = slug(name);
					await act.create(`${DESIGN_DIR.diagram}/${s}.${EXT[f]}`, TEMPLATE[f]);
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
