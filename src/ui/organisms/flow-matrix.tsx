import { Menu } from "@base-ui/react/menu";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { Button } from "../atoms/button";
import { Chip } from "../atoms/chip";
import { IconButton } from "../atoms/icon-button";
import { Input } from "../atoms/input";
import { Select } from "../atoms/select";
import { CheckIcon, XMarkIcon } from "../icons";
import { MenuList } from "../molecules/menu-button";
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
/** The token of "no brick": a select item cannot have an empty value. */
const NO_BRICK = "-";
/** The error of one field. The id of a new row is `""`. */
export type FlowError = { id: string; field: FlowField; message: string };

/** Allow and deny as tinted chips. Another action stays neutral. */
const TINT: Record<string, "success" | "you"> = { allow: "success", deny: "you" };
const CELL = "px-3 py-1.5 align-middle";

/** The columns in order. The extra ones show when `labels` names them. */
const ORDER: FlowField[] = [
	"name",
	"sourceName",
	"source",
	"destinationName",
	"destination",
	"network",
	"subnet",
	"protocol",
	"port",
];
const EXTRA = new Set<FlowField>(["name", "sourceName", "destinationName", "subnet"]);
const BRICK_FIELDS: FlowField[] = ["sourceName", "destinationName"];
const EMPTY: FlowDraft = {
	source: "",
	destination: "",
	network: "",
	protocol: "",
	port: "",
	action: "",
};

/**
 * The flow matrix: from, to, network zone, protocol, port, allowed. A row names its bricks, with
 * the addresses under them. The chips, the two pickers and the search combine. Edit and Remove of a
 * row are in its menu; the editor of a row holds every field. `startAdd` opens the editor of a new
 * row. A callback that returns `false` keeps the editor open: pass the field error in `error`. The
 * caller owns the rows and the checks.
 */
export function FlowMatrix({
	rows,
	actions,
	error,
	onAdd,
	onEdit,
	onRemove,
	labels,
	bricks,
	startAdd,
	addSignal,
	chipLabels,
}: {
	/**
	 * The page owns the "Add" control (its menu): each new number opens the editor of a new row, and
	 * the matrix draws no add button.
	 */
	addSignal?: number;
	/** The names of the filter chips by action value, when they differ from the names in a row. */
	chipLabels?: Record<string, string>;
	/** The editor of a new row is open at the start. */
	startAdd?: boolean;
	rows: FlowRow[];
	/** The names of the bricks. With them, the two brick columns pick one in place of typing. */
	bricks?: string[];
	/** The values of the action column, with their names. */
	actions: { value: string; label: string }[];
	error?: FlowError | null;
	onAdd: (draft: FlowDraft) => unknown;
	onEdit: (id: string, draft: FlowDraft) => unknown;
	onRemove: (id: string) => void;
	labels: Record<
		| "source"
		| "destination"
		| "network"
		| "protocol"
		| "port"
		| "action"
		| "all"
		| "search"
		| "add"
		| "edit"
		| "remove"
		| "save"
		| "cancel",
		string
	> &
		Partial<
			Record<
				| "name"
				| "sourceName"
				| "destinationName"
				| "subnet"
				// The column heads, when they differ from the field names.
				| "from"
				| "to"
				| "zone"
				| "allowed"
				// The name of the group of chips, and of a row menu with `{name}`.
				| "show"
				| "rowMenu",
				string
			>
		>;
}) {
	const TEXT = ORDER.filter((f) => !EXTRA.has(f) || labels[f] !== undefined);
	const [filter, setFilter] = useState<FlowFilter>(NO_FILTER);
	const [editing, setEditing] = useState<string | null>(startAdd ? "" : null);
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
	useEffect(() => {
		if (addSignal) {
			setDraft(EMPTY);
			setEditing("");
		}
	}, [addSignal]);
	const save = () => {
		const keep = editing === "" ? onAdd(draft) : onEdit(editing ?? "", draft);
		if (keep !== false) setEditing(null);
	};

	const cols = labels.name !== undefined && rows.some((r) => r.name) ? 8 : 7;
	const editor = (id: string) => (
		<tr key={`edit-${id}`} className="bg-n-2">
			<td colSpan={cols} className="p-3">
				<div className="flex flex-wrap items-end gap-2.5">
					{TEXT.map((f) =>
						bricks?.length && BRICK_FIELDS.includes(f) ? (
							<Select
								key={f}
								label={labels[f] ?? f}
								items={[
									{ value: NO_BRICK, label: "—" },
									...[...new Set([draft[f] ?? "", ...bricks])]
										.filter(Boolean)
										.map((b) => ({ value: b, label: b })),
								]}
								value={draft[f] || NO_BRICK}
								onValueChange={(v) => setDraft({ ...draft, [f]: v === NO_BRICK ? "" : v })}
							/>
						) : (
							<div key={f} className="w-40">
								<Input
									label={labels[f] ?? f}
									placeholder={labels[f] ?? f}
									value={draft[f] ?? ""}
									aria-invalid={error?.id === id && error.field === f ? true : undefined}
									onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
								/>
							</div>
						),
					)}
					<Select
						label={labels.action}
						items={actions}
						value={draft.action}
						onValueChange={(v) => setDraft({ ...draft, action: v })}
					/>
					<IconButton label={labels.save} onClick={save}>
						<CheckIcon size={16} />
					</IconButton>
					<IconButton label={labels.cancel} onClick={() => setEditing(null)}>
						<XMarkIcon size={16} />
					</IconButton>
				</div>
			</td>
		</tr>
	);
	/** A brick or a host by its name, with the address under it. */
	const end = (name: string | undefined, address: string) => (
		<td className={CELL}>
			{name ? <span className="block font-semibold">{name}</span> : null}
			<span className={cn("block", name ? "font-mono text-13 text-n-11" : "font-semibold")}>
				{address}
			</span>
		</td>
	);
	const heads = [
		labels.from ?? labels.source,
		labels.to ?? labels.destination,
		labels.zone ?? labels.network,
		labels.protocol,
		labels.port,
		labels.allowed ?? labels.action,
		...(cols === 8 ? [labels.name ?? ""] : []),
	];

	return (
		<div className="flex flex-col gap-6">
			<search className="flex flex-wrap items-center gap-2">
				<fieldset aria-label={labels.show ?? labels.action} className="contents">
					{[all, ...actions].map((a) => (
						<Chip
							key={a.value}
							selected={filter.action === a.value}
							className={filter.action === a.value ? undefined : "bg-surface-2"}
							onClick={() => setFilter({ ...filter, action: a.value })}
						>
							{chipLabels?.[a.value] ?? a.label}
						</Chip>
					))}
				</fieldset>
				<div className="w-70 max-w-full">
					<Input
						label={labels.search}
						placeholder={labels.search}
						type="search"
						value={filter.query}
						onChange={(e) => setFilter({ ...filter, query: e.target.value })}
					/>
				</div>
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
				{addSignal === undefined ? (
					<Button variant="primary" className="ml-auto" onClick={() => start("", EMPTY)}>
						{labels.add}
					</Button>
				) : null}
			</search>
			<div className="overflow-x-auto rounded-lg bg-surface-2 px-6 py-2 shadow-2">
				<table className="w-full min-w-[760px] border-collapse text-left">
					<thead>
						<tr>
							{heads.map((h) => (
								<th key={h} scope="col" className="h-11 px-3 text-13 font-normal text-n-11">
									{h}
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
								<tr key={r.id}>
									{end(r.sourceName, r.source)}
									{end(r.destinationName, r.destination)}
									<td className={CELL}>
										{r.network}
										{r.subnet ? (
											<span className="block font-mono text-13 text-n-11">{r.subnet}</span>
										) : null}
									</td>
									<td className={CELL}>{r.protocol}</td>
									<td className={cn(CELL, "font-mono")}>{r.port}</td>
									<td className={CELL}>
										<Badge variant={TINT[r.action] ?? "neutral"}>{actionName(r.action)}</Badge>
									</td>
									{cols === 8 ? <td className={CELL}>{r.name}</td> : null}
									<td className="py-1 text-right">
										<Menu.Root>
											<Menu.Trigger
												render={
													<Button
														variant="ghost"
														className="-my-2 px-0"
														aria-label={(labels.rowMenu ?? "{name}").replace(
															"{name}",
															`${r.sourceName || r.source} ${r.destinationName || r.destination}`,
														)}
													/>
												}
											>
												<svg
													aria-hidden="true"
													viewBox="0 0 16 16"
													className="size-4"
													fill="currentColor"
												>
													<circle cx="3" cy="8" r="1.25" />
													<circle cx="8" cy="8" r="1.25" />
													<circle cx="13" cy="8" r="1.25" />
												</svg>
											</Menu.Trigger>
											<MenuList
												items={[
													{ id: "edit", label: labels.edit, onSelect: () => start(r.id, r) },
													{
														id: "remove",
														label: labels.remove,
														danger: true,
														onSelect: () => onRemove(r.id),
													},
												]}
											/>
										</Menu.Root>
									</td>
								</tr>
							),
						)}
					</tbody>
				</table>
			</div>
			{error && editing === error.id ? (
				<p role="alert" className="text-danger-text">
					{labels[error.field]}: {error.message}
				</p>
			) : null}
		</div>
	);
}
