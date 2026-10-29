import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
	ARTIFACTS,
	type Change,
	kindStatus,
	useChanges,
	useMarkerCounts,
	useSpecsActions,
} from "@/lib/specs";
import { Button } from "@/ui/atoms/button";
import { StatusDot } from "@/ui/atoms/status-dot";
import { PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { ChangeDetail } from "./change-detail";
import { NameDialog } from "./name-dialog";
import { WithProject } from "./no-project";
import { DOT } from "./status";

/** Specs / Changes: each change with the status of its five artifacts and its open markers. */
export function SpecChanges() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.changes}>
			<ChangeList />
		</WithProject>
	);
}

function ChangeList() {
	const { t } = useI18n();
	const s = t.specs;
	const act = useSpecsActions();
	const list = useChanges().data;
	const markers = useMarkerCounts(list ?? []);
	const [open, setOpen] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);

	const columns = useMemo<ColumnDef<Change>[]>(
		() => [
			{ id: "id", header: s.change, cell: ({ row }) => row.original.id },
			...ARTIFACTS.map(
				(kind): ColumnDef<Change> => ({
					id: kind,
					header: s.artifact[kind],
					meta: { width: "5.5rem" },
					cell: ({ row }) => {
						const status = kindStatus(row.original, kind);
						return (
							<StatusDot status={DOT[status]} label={`${s.artifact[kind]}: ${s.status[status]}`} />
						);
					},
				}),
			),
			{
				id: "markers",
				header: s.markers,
				meta: { width: "6rem", numeric: true },
				cell: ({ row }) => String(markers[row.original.id] ?? 0),
			},
		],
		[s, markers],
	);

	const current = list?.find((c) => c.id === open);
	if (current) return <ChangeDetail change={current} onBack={() => setOpen(null)} />;
	const create = () => setCreating(true);
	return (
		<ListDetail
			title={t.tabs.specs.changes}
			toolbar={
				list?.length ? (
					<Button variant="primary" className="ml-auto" onClick={create}>
						<PlusIcon size={14} />
						{s.newChange}
					</Button>
				) : null
			}
		>
			{list && list.length === 0 ? (
				<div className="p-4">
					<EmptyState
						action={{ label: s.newChange, icon: <PlusIcon size={14} />, onClick: create }}
					/>
				</div>
			) : (
				<DataTable
					label={t.tabs.specs.changes}
					data={list ?? []}
					columns={columns}
					rowId={(c) => c.id}
					onOpen={(c) => setOpen(c.id)}
				/>
			)}
			{creating ? (
				<NameDialog
					title={s.newChange}
					label={s.changeId}
					onCreate={async (id) => {
						const c = await act.createChange(id);
						setOpen(c.id);
					}}
					onClose={() => setCreating(false)}
				/>
			) : null}
		</ListDetail>
	);
}
