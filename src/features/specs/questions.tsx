import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { KINDS, type QuestionEntry, STATUSES, useQuestions } from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { WithProject } from "./no-project";
import { FoldDialog, QuestionDialog } from "./question-dialogs";

const ALL = "all";

/** Specs / Questions: the RAID register with combined filters, create, edit and fold. */
export function Questions() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs.questions}>
			<Register />
		</WithProject>
	);
}

function Register() {
	const { t } = useI18n();
	const s = t.specs.question;
	const all = useQuestions().data;
	const [text, setText] = useState("");
	const [kind, setKind] = useState(ALL);
	const [status, setStatus] = useState(ALL);
	const [owner, setOwner] = useState(ALL);
	// `null` closed, `"new"` the create form.
	const [edit, setEdit] = useState<QuestionEntry | "new" | null>(null);
	const [fold, setFold] = useState<QuestionEntry | null>(null);

	const owners = [...new Set((all ?? []).map((e) => e.question.owner).filter(Boolean))].sort();
	const has = (v: string) => v.toLowerCase().includes(text.toLowerCase());
	const shown = (all ?? []).filter(
		({ question: q }) =>
			(text === "" || has(q.id) || has(q.title)) &&
			(kind === ALL || q.kind === kind) &&
			(status === ALL || q.status === status) &&
			(owner === ALL || q.owner === owner),
	);
	const columns = useMemo<ColumnDef<QuestionEntry>[]>(
		() => [
			{
				id: "id",
				header: s.id,
				meta: { width: "5rem" },
				cell: ({ row }) => row.original.question.id,
			},
			{ id: "title", header: s.title, cell: ({ row }) => row.original.question.title },
			{
				id: "kind",
				header: s.kind,
				meta: { width: "8rem" },
				cell: ({ row }) => <Badge>{row.original.question.kind}</Badge>,
			},
			{
				id: "status",
				header: s.status,
				meta: { width: "7rem" },
				cell: ({ row }) => row.original.question.status,
			},
			{
				id: "owner",
				header: s.owner,
				meta: { width: "8rem" },
				cell: ({ row }) => row.original.question.owner,
			},
			{
				id: "issues",
				header: "",
				meta: { width: "1rem" },
				cell: ({ row }) =>
					row.original.issues.length ? (
						<StatusDot status="warning" label={row.original.issues.join(", ")} />
					) : null,
			},
		],
		[s],
	);
	const options = (all: string, values: string[]) => [
		{ value: ALL, label: all },
		...values.map((v) => ({ value: v, label: v })),
	];
	const create = () => setEdit("new");
	return (
		<ListDetail
			title={t.tabs.specs.questions}
			toolbar={
				<>
					<FilterBar
						query={text}
						onQueryChange={setText}
						filters={[]}
						active={[]}
						onToggle={() => {}}
					/>
					<Select
						label={s.kind}
						value={kind}
						onValueChange={setKind}
						items={options(s.allKinds, KINDS)}
					/>
					<Select
						label={s.status}
						value={status}
						onValueChange={setStatus}
						items={options(s.allStatuses, STATUSES)}
					/>
					<Select
						label={s.owner}
						value={owner}
						onValueChange={setOwner}
						items={options(s.allOwners, owners)}
					/>
					{all?.length ? (
						<Button variant="primary" className="ml-auto" onClick={create}>
							<PlusIcon size={14} />
							{s.new}
						</Button>
					) : null}
				</>
			}
		>
			{all && all.length === 0 ? (
				<div className="p-4">
					<EmptyState action={{ label: s.new, icon: <PlusIcon size={14} />, onClick: create }} />
				</div>
			) : (
				<DataTable
					label={t.tabs.specs.questions}
					data={shown}
					columns={columns}
					rowId={(e) => e.path}
					onOpen={setEdit}
				/>
			)}
			{edit ? (
				<QuestionDialog
					key={edit === "new" ? "new" : edit.path}
					entry={edit === "new" ? null : edit}
					onClose={() => setEdit(null)}
					onFold={() => {
						if (edit !== "new") setFold(edit);
						setEdit(null);
					}}
				/>
			) : null}
			{fold ? <FoldDialog entry={fold} onClose={() => setFold(null)} /> : null}
		</ListDetail>
	);
}
