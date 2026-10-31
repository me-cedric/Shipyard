import { useEffect, useMemo, useState } from "react";
import { PageExport } from "@/features/reports/page-export";
import {
	type Artifact,
	type Brick,
	bricksPath,
	bricksText,
	DESIGN_DIR,
	ofKind,
	parseBricks,
	parseFlows,
	slug,
	TEMPLATE,
	useDesignActions,
	useDesignFile,
	useDesignList,
} from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { commands, type FlowRow_Deserialize, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { ArrowsRightLeftIcon, PlusIcon, TrashIcon } from "@/ui/icons";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { type FlowDraft, type FlowError, FlowMatrix } from "@/ui/organisms/flow-matrix";
import type { FlowField } from "@/ui/organisms/flow-rows";
import { FileFrame } from "./frame";
import { ArtifactTab } from "./tab";

// The fields that a row must hold. The port is the only optional one (REQ-018).
const REQUIRED: FlowField[] = ["source", "destination", "network", "protocol", "action"];

const toApi = (id: number, d: FlowDraft): FlowRow_Deserialize => ({
	id,
	source: d.source.trim(),
	destination: d.destination.trim(),
	network: d.network.trim(),
	protocol: d.protocol.trim(),
	port: d.port.trim() || null,
	action: d.action as "allow" | "deny",
	name: d.name?.trim() || null,
	subnet: d.subnet?.trim() || null,
	sourceName: d.sourceName?.trim() || null,
	destinationName: d.destinationName?.trim() || null,
});

/** The bricks of the network, one file beside the flows. A name is kept once, and a rename follows into the flows. */
function Bricks({
	path,
	file,
	bricks,
	onRename,
}: {
	path: string;
	file: ReturnType<typeof useDesignFile>;
	bricks: Brick[];
	onRename: (from: string, to: string) => void;
}) {
	const { t } = useI18n();
	const f = t.design.flows;
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const taken = (n: string, except?: string) =>
		bricks.some((b) => b.id !== except && b.name.trim().toLowerCase() === n.trim().toLowerCase());
	const save = (next: Brick[]) =>
		file.commit(async (stamp) =>
			unwrap(commands.designWrite(path, bricksText(next), stamp, stamp === null)),
		);
	return (
		<div className="flex flex-col gap-2">
			<form
				className="flex items-center gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const n = name.trim();
					if (!n) return;
					if (taken(n)) return setError(f.brickTaken);
					setError(null);
					setName("");
					void save([
						...bricks,
						{ id: `brick-${Date.now().toString(36)}`, name: n, description: "" },
					]);
				}}
			>
				<Input label={f.brickName} value={name} onChange={(e) => setName(e.target.value)} />
				<Button type="submit" disabled={!name.trim()}>
					<PlusIcon size={14} />
					{f.brickAdd}
				</Button>
			</form>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			<ul aria-label={f.bricksTab} className="flex flex-col divide-y">
				{bricks.map((b) => (
					<li key={b.id} className="flex items-center gap-2 py-1">
						<BrickField
							label={f.brickName}
							value={b.name}
							onSave={(v) => {
								if (!v.trim() || v.trim() === b.name) return;
								if (taken(v, b.id)) return setError(f.brickTaken);
								setError(null);
								void save(bricks.map((x) => (x.id === b.id ? { ...x, name: v.trim() } : x))).then(
									(ok) => ok && onRename(b.name, v.trim()),
								);
							}}
						/>
						<BrickField
							label={f.brickDescription}
							value={b.description}
							onSave={(v) =>
								void save(bricks.map((x) => (x.id === b.id ? { ...x, description: v } : x)))
							}
						/>
						<IconButton
							label={format(f.brickRemove, { name: b.name })}
							onClick={() => void save(bricks.filter((x) => x.id !== b.id))}
						>
							<TrashIcon size={14} />
						</IconButton>
					</li>
				))}
			</ul>
		</div>
	);
}

/** A text field that saves when it loses focus. */
function BrickField({
	label,
	value,
	onSave,
}: {
	label: string;
	value: string;
	onSave: (value: string) => void;
}) {
	const [v, setV] = useState(value);
	useEffect(() => setV(value), [value]);
	return (
		<Input
			label={`${label} ${value}`.trim()}
			value={v}
			onChange={(e) => setV(e.target.value)}
			onBlur={() => v !== value && onSave(v)}
		/>
	);
}

function Table({ a, file }: { a: Artifact; file: ReturnType<typeof useDesignFile> }) {
	const { t } = useI18n();
	const f = t.design.flows;
	const [error, setError] = useState<FlowError | null>(null);
	const { rows, error: bad } = useMemo(() => parseFlows(file.saved), [file.saved]);
	const [view, setView] = useState<"flows" | "bricks">("flows");
	const bricksFile = bricksPath(a.path);
	// A project with no bricks file yet starts empty. The first brick creates the file.
	const brickDoc = useDesignFile(bricksFile, bricksText([]));
	const bricks = useMemo(() => parseBricks(brickDoc.saved), [brickDoc.saved]);
	const shown = rows.map((r) => ({
		id: String(r.id),
		source: r.source,
		destination: r.destination,
		network: r.network,
		protocol: r.protocol,
		port: r.port ?? "",
		action: r.action,
		name: r.name ?? "",
		subnet: r.subnet ?? "",
		sourceName: r.sourceName ?? "",
		destinationName: r.destinationName ?? "",
	}));

	// Rejects a row with a missing field and names it. `false` keeps the editor open.
	const check = (id: string, d: FlowDraft) => {
		const field = REQUIRED.find((k) => !d[k]?.trim());
		setError(field ? { id, field, message: f.missing } : null);
		return !field;
	};
	const save = (next: FlowRow_Deserialize[]) =>
		file.commit(async (stamp) => unwrap(commands.designFlowsSave(a.path, next, stamp)));

	// A renamed brick keeps its flows: each flow that named it follows.
	const rename = (from: string, to: string) => {
		const follow = (n: string | null | undefined) => (n === from ? to : n);
		if (rows.some((r) => r.sourceName === from || r.destinationName === from))
			void save(
				rows.map((r) => ({
					...r,
					sourceName: follow(r.sourceName),
					destinationName: follow(r.destinationName),
				})),
			);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<h3 className="flex-1 text-14 font-medium">
					{format(t.count, {
						name: view === "flows" ? t.tabs.design.flows : f.bricksTab,
						count: view === "flows" ? rows.length : bricks.length,
					})}
				</h3>
				<ViewTabs
					label={f.views}
					value={view}
					onValueChange={setView}
					tabs={[
						{ value: "flows", label: t.tabs.design.flows },
						{ value: "bricks", label: f.bricksTab },
					]}
				/>
			</div>
			{view === "bricks" ? (
				<Bricks path={bricksFile} file={brickDoc} bricks={bricks} onRename={rename} />
			) : bad ? null : (
				<FlowMatrix
					rows={shown}
					bricks={bricks.map((b) => b.name).filter(Boolean)}
					actions={[
						{ value: "allow", label: f.allow },
						{ value: "deny", label: f.deny },
					]}
					error={error}
					labels={f}
					onAdd={(d) => {
						if (!check("", d)) return false;
						void save([...rows, toApi(Math.max(0, ...rows.map((r) => r.id)) + 1, d)]);
					}}
					onEdit={(id, d) => {
						if (!check(id, d)) return false;
						void save(rows.map((r) => (String(r.id) === id ? { ...r, ...toApi(r.id, d) } : r)));
					}}
					onRemove={(id) => void save(rows.filter((r) => String(r.id) !== id))}
				/>
			)}
		</div>
	);
}

/** Design / Flows: the network flow table with combined filters and row edits (REQ-016 to REQ-018). */
export function Flows() {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const rows = ofKind(list, "flow");
	return (
		<ArtifactTab
			title={t.tabs.design.flows}
			icon={<ArrowsRightLeftIcon size={16} />}
			noun={t.design.noun.flow}
			toolbar={rows.length ? <PageExport page="flows" /> : undefined}
			rows={rows.map((a) => ({ ref: a.reference, title: a.title, issue: a.issue }))}
			create={{
				run: async (name) => {
					const s = slug(name);
					await act.create(`${DESIGN_DIR.flow}/${s}.yaml`, TEMPLATE.flow);
					return `flow:${s}`;
				},
			}}
		>
			{(row) => {
				const a = rows.find((x) => x.reference === row.ref);
				return a ? (
					<FileFrame path={a.path} refId={a.reference} title={a.title} issue={a.issue} readOnly>
						{(file) => <Table a={a} file={file} />}
					</FileFrame>
				) : null;
			}}
		</ArtifactTab>
	);
}
