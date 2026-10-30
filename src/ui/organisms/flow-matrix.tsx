import { useMemo, useState } from "react";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { IconButton } from "../atoms/icon-button";
import { Input } from "../atoms/input";
import { Select } from "../atoms/select";
import {
	CheckIcon,
	MagnifyingGlassIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
	XMarkIcon,
} from "../icons";
import {
	ALL,
	distinct,
	type FlowField,
	type FlowFilter,
	type FlowRow,
	filterFlows,
	NO_FILTER,
} from "./flow-rows";

export type FlowDraft = Omit<FlowRow, "id">;
/** The error of one field. The id of a new row is `""`. */
export type FlowError = { id: string; field: FlowField; message: string };

/** Allow and deny as tinted chips. Another action stays neutral. */
const TINT: Record<string, "success" | "danger"> = { allow: "success", deny: "danger" };

const TEXT: FlowField[] = ["source", "destination", "network", "protocol", "port"];
const EMPTY: FlowDraft = {
	source: "",
	destination: "",
	network: "",
	protocol: "",
	port: "",
	action: "",
};

/**
 * The flow matrix: source, destination, VLAN or VNET, protocol, port, action.
 * The filters combine. A callback that returns `false` keeps the editor open: pass the field error
 * in `error`. The caller owns the rows and the checks.
 */
export function FlowMatrix({
	rows,
	actions,
	error,
	onAdd,
	onEdit,
	onRemove,
	labels,
}: {
	rows: FlowRow[];
	/** The values of the action column, with their names. */
	actions: { value: string; label: string }[];
	error?: FlowError | null;
	onAdd: (draft: FlowDraft) => unknown;
	onEdit: (id: string, draft: FlowDraft) => unknown;
	onRemove: (id: string) => void;
	labels: Record<
		FlowField | "all" | "search" | "add" | "edit" | "remove" | "save" | "cancel",
		string
	>;
}) {
	const [filter, setFilter] = useState<FlowFilter>(NO_FILTER);
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState<FlowDraft>(EMPTY);
	const shown = useMemo(() => filterFlows(rows, filter), [rows, filter]);
	const actionName = (v: string) => actions.find((a) => a.value === v)?.label ?? v;
	const all = { value: ALL, label: labels.all };
	const pick = (field: "network" | "protocol") => [
		all,
		...distinct(rows, field).map((v) => ({ value: v, label: v })),
	];

	const start = (id: string, from: FlowDraft) => {
		setDraft(from);
		setEditing(id);
	};
	const save = () => {
		const keep = editing === "" ? onAdd(draft) : onEdit(editing ?? "", draft);
		if (keep !== false) setEditing(null);
	};

	const editor = (id: string) => (
		<tr key={`edit-${id}`} className="bg-n-2 align-top">
			{TEXT.map((f) => (
				<td key={f} className="p-1">
					<Input
						label={labels[f]}
						value={draft[f]}
						aria-invalid={error?.id === id && error.field === f ? true : undefined}
						onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
					/>
				</td>
			))}
			<td className="p-1">
				<Select
					label={labels.action}
					items={actions}
					value={draft.action}
					onValueChange={(v) => setDraft({ ...draft, action: v })}
				/>
			</td>
			<td className="p-1">
				<div className="flex">
					<IconButton label={labels.save} onClick={save}>
						<CheckIcon size={14} />
					</IconButton>
					<IconButton label={labels.cancel} onClick={() => setEditing(null)}>
						<XMarkIcon size={14} />
					</IconButton>
				</div>
			</td>
		</tr>
	);

	return (
		<div className="flex flex-col gap-2">
			<search className="flex items-center gap-2">
				<Select
					label={labels.network}
					items={pick("network")}
					value={filter.network}
					onValueChange={(network) => setFilter({ ...filter, network })}
				/>
				<Select
					label={labels.protocol}
					items={pick("protocol")}
					value={filter.protocol}
					onValueChange={(protocol) => setFilter({ ...filter, protocol })}
				/>
				<Select
					label={labels.action}
					items={[all, ...actions]}
					value={filter.action}
					onValueChange={(action) => setFilter({ ...filter, action })}
				/>
				<div className="relative w-44">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-n-10"
					>
						<MagnifyingGlassIcon size={14} />
					</span>
					<Input
						label={labels.search}
						value={filter.query}
						onChange={(e) => setFilter({ ...filter, query: e.target.value })}
						className="pl-7"
					/>
				</div>
				<Button className="ml-auto" onClick={() => start("", EMPTY)}>
					<PlusIcon size={14} />
					{labels.add}
				</Button>
			</search>
			<table className="w-full border-collapse text-ui">
				<thead>
					<tr className="text-left text-12 text-n-11">
						{[...TEXT, "action" as const].map((f) => (
							<th key={f} scope="col" className="px-2 py-1 font-medium">
								{labels[f]}
							</th>
						))}
						<td />
					</tr>
				</thead>
				<tbody>
					{editing === "" ? editor("") : null}
					{shown.map((r) =>
						editing === r.id ? (
							editor(r.id)
						) : (
							<tr key={r.id} className="border-t border-n-6 hover:bg-n-2">
								{TEXT.map((f) => (
									<td key={f} className="px-2 py-1 font-mono text-12">
										{r[f]}
									</td>
								))}
								<td className="px-2 py-1">
									<Badge variant={TINT[r.action] ?? "neutral"}>{actionName(r.action)}</Badge>
								</td>
								<td className="px-2 py-1">
									<div className="flex justify-end">
										<IconButton
											label={`${labels.edit} ${r.source} ${r.destination}`}
											onClick={() => start(r.id, r)}
										>
											<PencilIcon size={14} />
										</IconButton>
										<IconButton
											label={`${labels.remove} ${r.source} ${r.destination}`}
											onClick={() => onRemove(r.id)}
										>
											<TrashIcon size={14} />
										</IconButton>
									</div>
								</td>
							</tr>
						),
					)}
				</tbody>
			</table>
			{error && editing === error.id ? (
				<p role="alert" className="text-ui text-danger-text">
					{labels[error.field]}: {error.message}
				</p>
			) : null}
		</div>
	);
}
