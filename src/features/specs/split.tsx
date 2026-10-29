import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { DiffRow_Serialize } from "@/lib/ipc";
import {
	type ApplyResult,
	type SplitItem,
	useSpecsActions,
	useSplitDraft,
	useSplitPreview,
} from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { PlusIcon, TrashIcon } from "@/ui/icons";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ApplyDialog, type ApplyPreviewRow } from "@/ui/organisms/apply-dialog";
import { Dialog } from "@/ui/organisms/dialog";
import { useGuard } from "./guard";

const toRow = (d: DiffRow_Serialize): ApplyPreviewRow => ({
	reference: d.row.reference,
	kind: d.row.kind,
	title: d.row.title,
	days: d.row.days,
	action: d.action,
	changes: d.changes,
	key: d.key,
});

const rowId = (title: string, items: SplitItem[]) => {
	const base =
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "item";
	let id = base;
	for (let n = 2; items.some((i) => i.rowId === id); n++) id = `${base}-${n}`;
	return id;
};

/** The add row: a kind, a title, a parent epic for a story, and the requirement refs. */
function AddItem({ items, onAdd }: { items: SplitItem[]; onAdd: (item: SplitItem) => void }) {
	const { t } = useI18n();
	const s = t.specs.split;
	const epics = items.filter((i) => i.kind === "epic");
	const [kind, setKind] = useState<"epic" | "story">("story");
	const [title, setTitle] = useState("");
	const [reqs, setReqs] = useState("");
	const [parent, setParent] = useState("");
	const story = kind === "story";
	const add = () => {
		onAdd({
			rowId: rowId(title, items),
			kind,
			title: title.trim(),
			description: "",
			reqs: reqs.split(/[\s,]+/).filter(Boolean),
			parent: story
				? epics.some((e) => e.rowId === parent)
					? parent
					: (epics[0]?.rowId ?? null)
				: null,
		});
		setTitle("");
		setReqs("");
	};
	return (
		<form
			aria-label={s.add}
			className="flex items-center gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				if (title.trim()) add();
			}}
		>
			<Select
				label={s.kind}
				value={kind}
				onValueChange={(v) => setKind(v as "epic" | "story")}
				items={[
					{ value: "epic", label: s.kinds.epic },
					{ value: "story", label: s.kinds.story },
				]}
			/>
			<Input label={s.itemTitle} value={title} onChange={(e) => setTitle(e.target.value)} />
			{story && epics.length ? (
				<Select
					label={s.parent}
					value={epics.some((e) => e.rowId === parent) ? parent : (epics[0]?.rowId ?? "")}
					onValueChange={setParent}
					items={epics.map((e) => ({ value: e.rowId, label: e.title }))}
				/>
			) : null}
			<Input label={s.reqs} value={reqs} onChange={(e) => setReqs(e.target.value)} />
			<IconButton label={s.add} type="submit" disabled={!title.trim()}>
				<PlusIcon size={14} />
			</IconButton>
		</form>
	);
}

/** The review of the draft: the PM edits, removes or adds an item. Nothing is written to the tracker. */
function Review({
	change,
	initial,
	onClose,
	onPreview,
}: {
	change: string;
	initial: SplitItem[];
	onClose: () => void;
	onPreview: () => void;
}) {
	const { t } = useI18n();
	const s = t.specs.split;
	const act = useSpecsActions();
	const { error, run } = useGuard();
	const [items, setItems] = useState(initial);
	const set = (id: string, patch: Partial<SplitItem>) =>
		setItems((xs) => xs.map((i) => (i.rowId === id ? { ...i, ...patch } : i)));
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={s.title}
			wide
			actions={
				<Button
					variant="primary"
					onClick={() =>
						void run(() => act.saveSplit({ change, items })).then((ok) => ok && onPreview())
					}
				>
					{s.preview}
				</Button>
			}
		>
			<ul aria-label={s.items} className="flex max-h-72 flex-col gap-1 overflow-auto">
				{items.map((i) => (
					<li key={i.rowId}>
						<fieldset
							aria-label={i.rowId}
							className="flex items-center gap-2 border-b py-1"
							style={{ paddingLeft: i.parent ? "1.5rem" : 0 }}
						>
							<Badge>{s.kinds[i.kind]}</Badge>
							<Input
								label={s.itemTitle}
								value={i.title}
								onChange={(e) => set(i.rowId, { title: e.target.value })}
							/>
							<span className="flex shrink-0 flex-wrap gap-1">
								{i.reqs.map((r) => (
									<RefChip key={r} refId={r} state="resolved" />
								))}
							</span>
							<IconButton
								label={`${s.remove} ${i.rowId}`}
								onClick={() =>
									setItems((xs) => xs.filter((x) => x.rowId !== i.rowId && x.parent !== i.rowId))
								}
							>
								<TrashIcon size={14} />
							</IconButton>
						</fieldset>
					</li>
				))}
			</ul>
			<AddItem items={items} onAdd={(item) => setItems((xs) => [...xs, item])} />
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}

/** The preview of the apply, then one click. The apply uses the row refs, so a second apply creates nothing. */
function ApplyStage({ change, onClose }: { change: string; onClose: () => void }) {
	const { t } = useI18n();
	const preview = useSplitPreview(change, true);
	const act = useSpecsActions();
	const { error, run } = useGuard();
	const [results, setResults] = useState<ApplyResult[] | undefined>();
	const [busy, setBusy] = useState(false);
	const problems = preview.data?.problems ?? [];
	const failed = preview.error instanceof Error ? preview.error.message : null;
	return (
		<ApplyDialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={t.specs.split.apply}
			rows={(preview.data?.rows ?? []).map(toRow)}
			results={results}
			busy={busy || preview.isLoading || problems.length > 0}
			error={error ?? failed ?? (problems.length ? problems.join("; ") : null)}
			onApply={() => {
				setBusy(true);
				void run(async () => setResults(await act.applySplit(change))).finally(() =>
					setBusy(false),
				);
			}}
		/>
	);
}

/** Split a change into work items: draft, review, preview, then apply (REQ-016 to REQ-019). */
export function SplitFlow({ change, onClose }: { change: string; onClose: () => void }) {
	const draft = useSplitDraft(change);
	const [stage, setStage] = useState<"review" | "apply">("review");
	if (stage === "apply") return <ApplyStage change={change} onClose={onClose} />;
	if (!draft.data) return null;
	return (
		<Review
			change={change}
			initial={draft.data.items}
			onClose={onClose}
			onPreview={() => setStage("apply")}
		/>
	);
}
