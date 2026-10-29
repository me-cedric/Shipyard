import { type ReactNode, useState } from "react";
import { Button } from "../atoms/button";
import { CodeEditor } from "../molecules/code-editor";
import { AdrDecision } from "../organisms/adr-decision";
import { BpmnViewer } from "../organisms/bpmn-viewer";
import { DbmlView } from "../organisms/dbml-view";
import { DrawioViewer } from "../organisms/drawio-viewer";
import { EditorFrame, type SaveState } from "../organisms/editor-frame";
import type { EditorError } from "../organisms/error-line";
import { ExcalidrawBoard } from "../organisms/excalidraw-board";
import { FlowMatrix } from "../organisms/flow-matrix";
import type { FlowRow } from "../organisms/flow-rows";
import { LikeC4View } from "../organisms/likec4-view";
import { MermaidView } from "../organisms/mermaid-view";
import { OpenApiView } from "../organisms/openapi-view";
import { TryPanel } from "../organisms/try-panel";

// The demo texts are English literals: the gallery is a developer page, not a product screen.
const MERMAID = "flowchart LR\n  A[Draft] --> B[Review]\n  B --> C[Accepted]";
const LIKEC4 = `specification {
  element person
  element system
}
model {
  user = person 'User'
  shop = system 'Shop'
  user -> shop 'buys'
}
views {
  view index {
    include *
  }
}`;
const DBML =
	"Table users {\n  id int [pk]\n  email varchar [not null]\n}\nTable orders {\n  id int [pk]\n  user_id int\n}\nRef: orders.user_id > users.id";
const OPENAPI = `openapi: 3.0.0
info: { title: Shop, version: "1" }
servers: [{ url: https://api.example.com }]
paths:
  /orders/{id}:
    get:
      tags: [orders]
      summary: One order
      parameters: [{ name: id, in: path, schema: { type: string } }]
      responses: { "200": { description: OK }, "404": { description: Not found } }`;
const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="d" targetNamespace="urn:demo">
  <bpmn:process id="p"><bpmn:startEvent id="s"/><bpmn:task id="t" name="Review"/><bpmn:sequenceFlow id="f" sourceRef="s" targetRef="t"/></bpmn:process>
  <bpmndi:BPMNDiagram id="di"><bpmndi:BPMNPlane id="pl" bpmnElement="p">
    <bpmndi:BPMNShape id="ss" bpmnElement="s"><dc:Bounds x="100" y="100" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="ts" bpmnElement="t"><dc:Bounds x="200" y="78" width="100" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="fe" bpmnElement="f"><di:waypoint x="136" y="118"/><di:waypoint x="200" y="118"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
const DRAWIO_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" content="&lt;mxfile&gt;&lt;/mxfile&gt;"><rect x="2" y="2" width="116" height="56" rx="6" fill="#fff" stroke="#333"/><text x="60" y="34" text-anchor="middle" font-size="12">draw.io</text></svg>';
const FLOWS: FlowRow[] = [
	{
		id: "1",
		source: "web",
		destination: "db",
		network: "VLAN10",
		protocol: "tcp",
		port: "5432",
		action: "allow",
	},
	{
		id: "2",
		source: "app",
		destination: "dns",
		network: "VNET2",
		protocol: "udp",
		port: "53",
		action: "deny",
	},
];

const LABELS = {
	frame: {
		copy: "Copy ref",
		dirty: "Unsaved",
		conflict: "The file changed on disk",
		reload: "Reload",
		keepMine: "Keep mine",
		line: "Line",
	},
	dbml: { pk: "PK", notNull: "Not null", relations: "Relations" },
	api: {
		parameters: "Parameters",
		responses: "Responses",
		required: "Required",
		untagged: "Other",
	},
	try: {
		server: "Server",
		method: "Method",
		path: "Path",
		body: "Body",
		send: "Send",
		status: "Status",
		failure: "Failed",
	},
	flow: {
		source: "Source",
		destination: "Destination",
		network: "Network",
		protocol: "Protocol",
		port: "Port",
		action: "Action",
		all: "All",
		search: "Search",
		add: "Add flow",
		edit: "Edit",
		remove: "Remove",
		save: "Save",
		cancel: "Cancel",
	},
};

/** A heavy demo mounts on demand, so the page does not load every editor. */
function Demo({ name, children }: { name: string; children: ReactNode }) {
	const [on, setOn] = useState(false);
	return (
		<div className="flex flex-col gap-2 border-b py-3">
			<div className="flex items-center gap-3">
				<span className="w-32 font-mono text-11 text-n-10">{name}</span>
				<Button aria-pressed={on} onClick={() => setOn(!on)}>
					{on ? "Hide" : "Show"}
				</Button>
			</div>
			{on ? children : null}
		</div>
	);
}

/** A text view over a code editor, with the error in the frame. */
function TextDemo({
	title,
	initial,
	view,
}: {
	title: string;
	initial: string;
	view: (source: string, onError: (e: EditorError | null) => void) => ReactNode;
}) {
	const [source, setSource] = useState(initial);
	const [error, setError] = useState<EditorError | null>(null);
	const [save, setSave] = useState<SaveState>("clean");
	return (
		<EditorFrame
			title={title}
			refId={`spec:${title.toLowerCase()}`}
			save={save}
			error={error}
			primary={{ label: "Save", onClick: () => setSave("clean"), disabled: save !== "dirty" }}
			onReload={() => setSave("clean")}
			onKeepMine={() => setSave("dirty")}
			labels={LABELS.frame}
		>
			<div className="grid grid-cols-2 gap-3">
				<CodeEditor
					label={title}
					value={source}
					errorLine={error?.line}
					onChange={(v) => {
						setSource(v);
						setSave("dirty");
					}}
				/>
				{view(source, setError)}
			</div>
		</EditorFrame>
	);
}

/** The Design and Specs parts: the frame, the editors, the diagram views, the data views. */
export function DesignParts() {
	const [flows, setFlows] = useState(FLOWS);
	return (
		<>
			<Demo name="EditorFrame conflict">
				<EditorFrame
					title="Checkout"
					refId="spec:checkout"
					save="conflict"
					error={{ message: "Unexpected token", line: 4 }}
					primary={{ label: "Save", onClick: () => {} }}
					labels={LABELS.frame}
				>
					<CodeEditor label="Checkout" value={"a\nb\nc\nd"} errorLine={4} />
				</EditorFrame>
			</Demo>
			<Demo name="MermaidView">
				<TextDemo
					title="Mermaid"
					initial={MERMAID}
					view={(s, e) => <MermaidView source={s} label="Mermaid" onError={e} />}
				/>
			</Demo>
			<Demo name="LikeC4View">
				<TextDemo
					title="LikeC4"
					initial={LIKEC4}
					view={(s, e) => <LikeC4View source={s} label="LikeC4" onError={e} />}
				/>
			</Demo>
			<Demo name="DbmlView">
				<TextDemo
					title="DBML"
					initial={DBML}
					view={(s, e) => <DbmlView source={s} labels={LABELS.dbml} onError={e} />}
				/>
			</Demo>
			<Demo name="OpenApiView">
				<TextDemo
					title="OpenAPI"
					initial={OPENAPI}
					view={(s, e) => (
						<OpenApiView
							source={s}
							labels={LABELS.api}
							onError={e}
							tryPanel={(op, doc) => (
								<TryPanel
									servers={doc.servers}
									method={op.method}
									path={op.path}
									params={op.parameters}
									labels={LABELS.try}
									onSend={async (r) => ({ status: 200, body: JSON.stringify(r, null, 2) })}
								/>
							)}
						/>
					)}
				/>
			</Demo>
			<Demo name="ExcalidrawBoard">
				<div className="h-96">
					<ExcalidrawBoard text="" label="Board" onChange={() => {}} />
				</div>
			</Demo>
			<Demo name="BpmnViewer">
				<BpmnViewer text={BPMN} label="Process" />
			</Demo>
			<Demo name="DrawioViewer">
				<DrawioViewer text={DRAWIO_SVG} svg label="Board" invalid="Not a draw.io board" />
			</Demo>
			<Demo name="FlowMatrix">
				<FlowMatrix
					rows={flows}
					actions={[
						{ value: "allow", label: "Allow" },
						{ value: "deny", label: "Deny" },
					]}
					labels={LABELS.flow}
					onAdd={(d) => setFlows([...flows, { ...d, id: String(flows.length + 1) }])}
					onEdit={(id, d) => setFlows(flows.map((f) => (f.id === id ? { ...d, id } : f)))}
					onRemove={(id) => setFlows(flows.filter((f) => f.id !== id))}
				/>
			</Demo>
			<Demo name="AdrDecision">
				<AdrDecision
					onAccept={() => {}}
					onReject={() => {}}
					labels={{ accept: "Accept", reject: "Reject", comment: "Comment" }}
				/>
			</Demo>
		</>
	);
}
