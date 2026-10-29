import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Requirement } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { type Capability, useCapabilities, useFile, useSpecView } from "@/lib/specs";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronLeftIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { WithProject } from "./no-project";

const FILES = ["spec", "plan", "checklist", "tasks"] as const;

/** One file of a settled capability, read only. */
function CapabilityFile({ path, name }: { path: string; name: string }) {
	const file = useFile(path);
	return (
		<CodeEditor label={name} value={file.data?.text ?? ""} readOnly className="min-h-0 flex-1" />
	);
}

/** A capability: its requirements with their ids, then its four files. A requirement opens in the inspector. */
function CapabilityDetail({ cap, onBack }: { cap: Capability; onBack: () => void }) {
	const { t } = useI18n();
	const s = t.specs;
	const { openRef } = useShell();
	const view = useSpecView(cap.path).data;
	const [file, setFile] = useState<(typeof FILES)[number]>("spec");
	const [selected, setSelected] = useState<string | null>(null);
	const columns = useMemo<ColumnDef<Requirement>[]>(
		() => [
			{
				id: "id",
				header: s.requirementId,
				meta: { width: "6rem" },
				cell: ({ row }) => row.original.id,
			},
			{ id: "title", header: s.requirement, cell: ({ row }) => row.original.title },
		],
		[s],
	);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
			<h1 className="sr-only">{cap.capability}</h1>
			<div className="flex items-center gap-2">
				<IconButton label={s.back} onClick={onBack}>
					<ChevronLeftIcon size={14} />
				</IconButton>
				<h2 className="text-14 font-medium">{cap.capability}</h2>
			</div>
			<div className="flex h-56 shrink-0 flex-col rounded-md border border-n-7">
				<DataTable
					label={s.requirements}
					data={view?.requirements ?? []}
					columns={columns}
					rowId={(r) => r.id}
					selected={selected}
					onOpen={(r) => {
						setSelected(r.id);
						openRef(`spec:${cap.capability}#${r.id}`);
					}}
				/>
			</div>
			<ViewTabs
				label={s.files}
				value={file}
				onValueChange={setFile}
				tabs={FILES.map((f) => ({ value: f, label: s.artifact[f] }))}
			/>
			<CapabilityFile
				key={file}
				path={cap.path.replace(/spec\.md$/, `${file}.md`)}
				name={s.artifact[file]}
			/>
		</div>
	);
}

/** Specs / Capabilities: the settled capabilities with their requirement counts. */
export function Capabilities() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.capabilities}>
			<CapabilityList />
		</WithProject>
	);
}

function CapabilityList() {
	const { t } = useI18n();
	const s = t.specs;
	const list = useCapabilities().data ?? [];
	const [open, setOpen] = useState<string | null>(null);
	const columns = useMemo<ColumnDef<Capability>[]>(
		() => [
			{ id: "name", header: s.capability, cell: ({ row }) => row.original.capability },
			{
				id: "count",
				header: s.requirements,
				meta: { width: "8rem", numeric: true },
				cell: ({ row }) => String(row.original.requirements),
			},
		],
		[s],
	);
	const current = list.find((c) => c.capability === open);
	if (current) return <CapabilityDetail cap={current} onBack={() => setOpen(null)} />;
	return (
		<ListDetail title={t.tabs.specs.capabilities}>
			<DataTable
				label={t.tabs.specs.capabilities}
				data={list}
				columns={columns}
				rowId={(c) => c.capability}
				onOpen={(c) => setOpen(c.capability)}
			/>
		</ListDetail>
	);
}
