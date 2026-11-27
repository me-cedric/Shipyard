import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import {
	type ApplyRow,
	type DiffRow,
	useApplyPreview,
	useWorkActions,
	useWorkContext,
} from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { buttonVariants } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { PencilIcon } from "@/ui/icons";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { ATTENTION_FRAME } from "./capacity";

const HEAD = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-10";

/**
 * Plan / People, send to the issue tracker: what the send creates, what it changes and what stays.
 * The page opens on the preview, which writes nothing. Each row can be approved, edited or dropped.
 * One click on Send writes the approved rows, and each row then shows its own result (REQ-025,
 * REQ-026). A failed row never undoes the rows before it.
 */
export function SendPage({ slug }: { slug: string }) {
	const { t } = useI18n();
	const p = t.planPlace;
	const a = t.work.apply;
	const r = t.review.apply;
	const slugs = [slug];
	const preview = useApplyPreview(slugs, true);
	const ctx = useWorkContext().data;
	const act = useWorkActions();
	const { failure, run } = useGuard();
	const [results, setResults] = useState<ApplyRow[] | undefined>();
	const [busy, setBusy] = useState(false);
	const [dropped, setDropped] = useState<string[]>([]);
	const [edits, setEdits] = useState<Record<string, { title?: string; days?: string }>>({});
	const [editing, setEditing] = useState<string | null>(null);
	const rows = preview.data ?? [];
	const fields = (list: string[]) =>
		list.map((f) => a.field[f as keyof typeof a.field] ?? f).join(", ");
	/** A new ticket has no list of changes: it writes each field that the row fills. */
	const changed = (d: DiffRow) =>
		d.action === "create"
			? [
					"title",
					...(d.row.description.trim() ? ["description"] : []),
					...(d.row.days !== null ? ["estimate"] : []),
					...(d.row.parent !== null ? ["parent"] : []),
				]
			: d.changes;
	const titleOf = (d: DiffRow) => edits[d.row.reference]?.title ?? d.row.title;
	/** The row as the person edited it. */
	const edited = (d: DiffRow) => {
		const e = edits[d.row.reference];
		const days = e?.days === undefined ? d.row.days : e.days === "" ? null : Number(e.days);
		return { reference: d.row.reference, title: titleOf(d), days };
	};
	const approved = rows.filter(
		(d) => d.action !== "unchanged" && !dropped.includes(d.row.reference),
	);
	const send = (list: DiffRow[]) => {
		setBusy(true);
		void run(async () => {
			const done = await act.applyRows(slugs, list.map(edited));
			const refs = new Set(done.map((x) => x.reference));
			setResults((old) => [...(old ?? []).filter((x) => !refs.has(x.reference)), ...done]);
			// The rest of the issue tracker: the mirror reads what changed there. A failed poll is not a send error.
			await commands.syncNow().catch(() => undefined);
		}).finally(() => setBusy(false));
	};

	const head = (name: string, count: number) => (
		<h2 className={HEAD}>{format(p.group, { name, count })}</h2>
	);
	const kind = (d: DiffRow) => <Badge>{a.kinds[d.row.kind]}</Badge>;
	/** The rows to write, each with its box and its fields. */
	const toWrite = (action: "create" | "update") => {
		const list = rows.filter((d) => d.action === action);
		return list.length === 0 ? null : (
			<Card className="py-2">
				{head(p.groups[action], list.length)}
				{list.map((d) => {
					const ref = d.row.reference;
					const set = (patch: { title?: string; days?: string }) =>
						setEdits((all) => ({ ...all, [ref]: { ...all[ref], ...patch } }));
					return (
						<Row key={ref}>
							<Checkbox
								hideLabel
								id={`send-${ref}`}
								label={format(r.write, { name: d.row.title })}
								checked={!dropped.includes(ref)}
								onCheckedChange={(on) =>
									setDropped((x) => (on ? x.filter((y) => y !== ref) : [...x, ref]))
								}
							/>
							{kind(d)}
							{editing === ref ? (
								<>
									<span className="flex-[1_1_12rem]">
										<Input
											label={format(r.title, { name: d.row.title })}
											value={titleOf(d)}
											onChange={(e) => set({ title: e.target.value })}
										/>
									</span>
									{d.row.kind === "story" ? (
										<Input
											type="number"
											min={0}
											step={0.5}
											className="w-24"
											label={format(r.days, { name: d.row.title })}
											value={edits[ref]?.days ?? String(d.row.days ?? "")}
											onChange={(e) => set({ days: e.target.value })}
										/>
									) : null}
								</>
							) : (
								// A click on the title toggles the box.
								<label
									htmlFor={`send-${ref}`}
									className="flex min-h-control flex-[1_1_12rem] cursor-pointer items-center font-semibold"
								>
									{titleOf(d)}
								</label>
							)}
							<span className="ml-auto text-n-10">{fields(changed(d))}</span>
							<IconButton
								label={format(p.sendPage.editRow, { name: d.row.title })}
								aria-pressed={editing === ref}
								onClick={() => setEditing(editing === ref ? null : ref)}
							>
								<PencilIcon size={16} />
							</IconButton>
						</Row>
					);
				})}
			</Card>
		);
	};
	const byRef = new Map(rows.map((d) => [d.row.reference, d]));
	/** The rows of the send with one result, each with its ticket or its error. */
	const sent = (name: string, list: ApplyRow[]) =>
		list.length === 0 ? null : (
			<Card className="py-2">
				{head(name, list.length)}
				{list.map((x) => {
					const d = byRef.get(x.reference);
					return (
						<Row key={x.reference}>
							{d ? kind(d) : null}
							<span className="flex-[1_1_12rem] font-semibold">{d ? titleOf(d) : x.reference}</span>
							<span className={x.error ? "text-danger-text" : "text-n-10"}>
								{x.error ?? (x.skipped.length ? `${a.skipped}: ${fields(x.skipped)}` : "")}
							</span>
						</Row>
					);
				})}
			</Card>
		);
	const bad = (results ?? []).filter((x) => x.error);
	const good = (results ?? []).filter((x) => !x.error && x.action !== "unchanged");
	const sentRefs = new Set((results ?? []).map((x) => x.reference));
	const kept = new Set(
		(results ?? []).filter((x) => !x.error && x.action === "unchanged").map((x) => x.reference),
	);
	const same = rows.filter(
		(d) =>
			kept.has(d.row.reference) || (d.action === "unchanged" && !sentRefs.has(d.row.reference)),
	);
	const notSent = rows.filter((d) => d.action !== "unchanged" && !sentRefs.has(d.row.reference));
	const count = (name: string, n: number, variant?: "success") => (
		<>
			<span className="font-semibold">{name}</span>
			<Badge variant={variant}>{n}</Badge>
		</>
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				title={p.dates.sendPlan}
				back={
					<BackLink
						label={p.views.people}
						render={(props) => <Link to="/plan/people" {...props} />}
					/>
				}
			/>
			<div className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-6 overflow-y-auto px-4 pt-1 pb-4">
				<div className="flex min-w-0 flex-[3_1_32rem] flex-col gap-4">
					{results ? (
						<>
							{sent(a.group.failed, bad)}
							{sent(a.group.written, good)}
						</>
					) : (
						<>
							{toWrite("create")}
							{toWrite("update")}
						</>
					)}
					{same.length > 0 ? (
						<Card className="py-2">
							{head(p.groups.unchanged, same.length)}
							<Row>
								<span className="py-3 text-n-10">{same.map((d) => d.row.title).join(", ")}</span>
							</Row>
						</Card>
					) : null}
				</div>
				<div className="flex min-w-0 flex-[2_1_19rem] flex-col gap-6">
					{results ? null : (
						<Card pad className={`flex flex-col gap-3.5 ${ATTENTION_FRAME}`}>
							<h2 className="text-20 font-semibold text-n-12">
								{approved.length === 1
									? p.sendPage.writesOne
									: format(p.sendPage.writes, { count: approved.length })}
							</h2>
							{/* Send has a wrapper (its reason), so the buttons fill their own cell: both halves stay equal. */}
							<div className="flex flex-wrap gap-2.5 [&>*]:flex-[1_1_6rem] [&_button]:w-full">
								<Link to="/plan/people" className={buttonVariants()}>
									{t.sync.backlog.cancel}
								</Link>
								<RightButton
									right="work.edit"
									variant="primary"
									busy={busy || preview.isLoading}
									disabled={busy || preview.isLoading || approved.length === 0 || !ctx?.tracker}
									reason={ctx?.tracker ? undefined : t.work.noTracker}
									onClick={() => send(approved)}
								>
									{t.work.time.send}
								</RightButton>
							</div>
						</Card>
					)}
					<ErrorNotice error={failure ?? preview.error} />
					{
						<Card className="py-2">
							<h2 className={HEAD}>{p.sendPage.after}</h2>
							<Row>{count(a.group.written, good.length, "success")}</Row>
							<Row>
								{count(a.group.failed, bad.length)}
								<span className="flex-1" />
								{bad.length > 0 ? (
									<RightButton
										right="work.edit"
										busy={busy}
										disabled={busy}
										onClick={() => send(bad.flatMap((x) => byRef.get(x.reference) ?? []))}
									>
										{p.sendPage.tryAgain}
									</RightButton>
								) : null}
							</Row>
							<Row>{count(a.skipped, notSent.length)}</Row>
						</Card>
					}
				</div>
			</div>
		</div>
	);
}
