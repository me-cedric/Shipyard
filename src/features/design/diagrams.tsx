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
import { Button } from "@/ui/atoms/button";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { BpmnViewer } from "@/ui/organisms/bpmn-viewer";
import { DrawioViewer } from "@/ui/organisms/drawio-viewer";
import { ExcalidrawBoard } from "@/ui/organisms/excalidraw-board";
import { MermaidView } from "@/ui/organisms/mermaid-view";
import { FileFrame } from "./frame";
import { useOpenOutside } from "./open";
import { ArtifactTab } from "./tab";

const EXT = { excalidraw: "excalidraw", mermaid: "mmd" } as const;

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
			noun={t.design.noun.diagram}
			rows={rows.map((a) => ({
				ref: a.reference,
				title: a.title,
				tag: (t.design.formats as Record<string, string>)[a.format ?? ""] ?? a.format,
				issue: a.issue,
			}))}
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
