import { useMemo, useState } from "react";
import {
	type Artifact,
	DESIGN_DIR,
	ofKind,
	parseFlows,
	slug,
	TEMPLATE,
	useDesignActions,
	type useDesignFile,
	useDesignList,
} from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { commands, type FlowRow_Deserialize, unwrap } from "@/lib/ipc";
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
});

function Table({ a, file }: { a: Artifact; file: ReturnType<typeof useDesignFile> }) {
	const { t } = useI18n();
	const f = t.design.flows;
	const [error, setError] = useState<FlowError | null>(null);
	const { rows, error: bad } = useMemo(() => parseFlows(file.saved), [file.saved]);
	const shown = rows.map((r) => ({
		id: String(r.id),
		source: r.source,
		destination: r.destination,
		network: r.network,
		protocol: r.protocol,
		port: r.port ?? "",
		action: r.action,
	}));

	// Rejects a row with a missing field and names it. `false` keeps the editor open.
	const check = (id: string, d: FlowDraft) => {
		const field = REQUIRED.find((k) => !d[k].trim());
		setError(field ? { id, field, message: f.missing } : null);
		return !field;
	};
	const save = (next: FlowRow_Deserialize[]) =>
		file.commit(async (stamp) => unwrap(commands.designFlowsSave(a.path, next, stamp)));

	return (
		<div className="flex flex-col gap-2">
			<h3 className="text-14 font-medium">
				{format(t.count, { name: t.tabs.design.flows, count: rows.length })}
			</h3>
			{bad ? null : (
				<FlowMatrix
					rows={shown}
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
			noun={t.design.noun.flow}
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
