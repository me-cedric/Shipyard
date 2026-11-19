import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { type ApplyRow, type DiffRow, useWorkActions, useWorkContext } from "@/lib/work";
import { CpuChipIcon } from "@/ui/icons";
import { ApplyDialog, type ApplyPreviewRow } from "@/ui/organisms/apply-dialog";
import { useGuard } from "./guard";

const toRow = (d: DiffRow): ApplyPreviewRow => ({
	reference: d.row.reference,
	kind: d.row.kind,
	title: d.row.title,
	days: d.row.days,
	action: d.action,
	changes: d.changes,
	key: d.key,
});

/**
 * One work item from a ref, after one click. The dialog shows the row first. A second click on a
 * ref that a ticket already holds shows the row as unchanged and creates nothing (REQ-029).
 */
export function CreateWorkItem({ refId, title }: { refId: string; title: string }) {
	const { t } = useI18n();
	const ctx = useWorkContext().data;
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [open, setOpen] = useState(false);
	const [rows, setRows] = useState<DiffRow[]>([]);
	const [results, setResults] = useState<ApplyRow[] | undefined>();
	if (!ctx?.tracker) return null;
	const row = {
		reference: refId,
		kind: "story" as const,
		title,
		description: "",
		days: null,
		parent: null,
	};

	return (
		<>
			<RightButton
				right="work.edit"
				onClick={() =>
					void run(async () => {
						setResults(undefined);
						setRows([await act.previewItem(row)]);
						setOpen(true);
					})
				}
			>
				<CpuChipIcon size={14} />
				{t.work.item.create}
			</RightButton>
			{error && !open ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{open ? (
				<ApplyDialog
					open
					onOpenChange={(o) => !o && setOpen(false)}
					title={t.work.item.create}
					rows={rows.map(toRow)}
					results={results}
					error={error}
					onApply={() => void run(async () => setResults([await act.createItem(row)]))}
				/>
			) : null}
		</>
	);
}
