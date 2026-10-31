import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands } from "@/lib/ipc";
import {
	type ApplyRow,
	type DiffRow,
	useApplyPreview,
	useWorkActions,
	useWorkContext,
} from "@/lib/work";
import { Button } from "@/ui/atoms/button";
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
 * Apply the sheets to the tracker. The dialog opens on the preview, which writes nothing. Each row
 * can be approved, edited or dropped. One click on Apply writes the approved rows, and each row
 * then shows its own result (REQ-025, REQ-026).
 */
export function ApplyFlow({ slugs, onClose }: { slugs: string[]; onClose: () => void }) {
	const { t } = useI18n();
	const preview = useApplyPreview(slugs, true);
	const act = useWorkActions();
	const { error, run } = useGuard();
	const [results, setResults] = useState<ApplyRow[] | undefined>();
	const [busy, setBusy] = useState(false);
	const failed = preview.error instanceof Error ? preview.error.message : null;

	return (
		<ApplyDialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={t.work.apply.title}
			rows={(preview.data ?? []).map(toRow)}
			results={results}
			busy={busy || preview.isLoading}
			error={error ?? failed}
			review
			onApply={(approved) => {
				setBusy(true);
				void run(async () => {
					setResults(await act.applyRows(slugs, approved));
					// The rest of the tracker: the mirror reads what changed there. A failed poll is not an apply error.
					await commands.syncNow().catch(() => undefined);
				}).finally(() => setBusy(false));
			}}
		/>
	);
}

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
			<Button
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
			</Button>
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
