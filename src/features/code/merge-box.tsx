import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type MergeMethod, type PullDetail, useForgeActions } from "@/lib/code";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { Select } from "@/ui/atoms/select";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SplitButton } from "@/ui/molecules/split-button";
import { CI_STATUS, REVIEW_STATUS } from "./status";
import { useRun } from "./use-run";

/**
 * Archives a spec change in the branch of the pull request: one commit and a push. A change with
 * open items asks for a second click that says so.
 */
function ArchiveBar({ number }: { number: number }) {
	const { t } = useI18n();
	const { archiveSpec } = useForgeActions();
	const changes = useQuery({
		queryKey: ["specs", "changes"],
		queryFn: () => unwrap(commands.specsChanges()),
	}).data;
	const [change, setChange] = useState("");
	const [error, setError] = useState<unknown>(null);
	const [done, setDone] = useState<string | null>(null);
	const [open, setOpen] = useState(false);
	if (!changes?.length) return null;
	const chosen = change || changes[0]?.id || "";
	const go = async (confirmed: boolean) => {
		try {
			setError(null);
			setDone(await archiveSpec(number, chosen, confirmed));
			setOpen(false);
		} catch (e) {
			setError(e);
			setOpen(toFailure(e).details.includes("open items"));
		}
	};
	return (
		<div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
			<Select
				label={t.forge.change}
				value={chosen}
				onValueChange={(v) => {
					setChange(v);
					setOpen(false);
				}}
				items={changes.map((c) => ({ value: c.id, label: c.id }))}
				className="min-w-40"
			/>
			<Button onClick={() => void go(false)}>{t.forge.archiveChange}</Button>
			{open ? (
				<Button variant="danger" onClick={() => void go(true)}>
					{t.forge.archiveAnyway}
				</Button>
			) : null}
			{done ? (
				<span role="status">{format(t.forge.archived, { sha: done.slice(0, 7) })}</span>
			) : null}
			<ErrorNotice error={error} />
		</div>
	);
}

/** One of the three segments of the box: a word, a small meter and the numbers. */
function Segment({
	label,
	value,
	max,
	text,
	status,
	statusLabel,
	title,
}: {
	label: string;
	value: number;
	max: number;
	text: string;
	status?: Status;
	statusLabel?: string;
	title?: string;
}) {
	return (
		<div title={title} className="flex min-w-0 flex-1 flex-col gap-1">
			<p className="flex items-center gap-1.5 text-12 text-n-11">
				{status ? <StatusDot status={status} label={statusLabel} className="size-2" /> : null}
				{label}
			</p>
			<Progress value={value} max={max} label={label} />
			<p className="text-12 text-n-12">{text}</p>
		</div>
	);
}

/**
 * The status line in words, and its status. A merged or closed pull request and a draft have their
 * own line. Pending checks come before a block of the code host. `mergeable` `unknown` says only that it checks.
 */
export function mergeStatus(d: PullDetail, t: Messages): { text: string; status: Status } {
	const p = t.forge.pullPage;
	if (d.state !== "open") return { text: t.forge.state[d.state as "open"], status: "idle" };
	if (d.draft) return { text: p.draftFirst, status: "idle" };
	const failing = d.checks.filter((c) => c.state === "failing").length;
	const changes = d.verdicts.some((v) => v.state === "changes-requested");
	const why = [
		d.mergeable === "conflict" ? p.conflict : null,
		failing === 1 ? p.failingOne : failing > 1 ? format(p.failingMany, { count: failing }) : null,
		failing === 0 && d.ci === "failing" ? t.forge.ci.failing : null,
		changes ? p.changes : null,
	].filter((x) => x !== null);
	if (why.length === 1 && changes) return { text: p.changesRequested, status: "danger" };
	if (why.length) return { text: format(p.blocked, { why: why.join(", ") }), status: "danger" };
	if (d.ci === "pending") return { text: p.running, status: "active" };
	if (d.mergeable === "blocked") return { text: p.blockedByHost, status: "danger" };
	if (d.mergeable === "unknown") return { text: p.checkingMerge, status: "idle" };
	return { text: p.ready, status: "success" };
}

/**
 * The merge box (REQ-043): the status line, three segments and the merge action. Merge names its
 * method in a confirmation. Failing checks or requested changes make the confirmation a danger
 * action that names the risk. Merge stays off for a draft or a pull request that is not open.
 */
export function MergeBox({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const p = t.forge.pullPage;
	const { merge } = useForgeActions();
	const { gate } = useRights();
	const { failure, run } = useRun();
	const [method, setMethod] = useState<MergeMethod | null>(null);
	const [confirming, setConfirming] = useState(false);
	const current = method ?? d.mergeMethods[0] ?? "merge";
	const review = d.verdicts.some((v) => v.state === "changes-requested")
		? "changes_requested"
		: "clear";
	const risk =
		d.ci === "failing"
			? t.forge.confirmFailing
			: review === "changes_requested"
				? t.forge.confirmChanges
				: null;
	const line = mergeStatus(d, t);
	const count = (state: string) => d.checks.filter((c) => c.state === state).length;
	const approved = d.verdicts.filter((v) => v.state === "approved");
	const open = d.threads.filter((th) => !th.resolved).length;
	const off = d.draft || d.state !== "open";
	const right = gate("code.merge");
	const confirm = () =>
		void run(async () => {
			setConfirming(false);
			await merge(d.number, current);
		});
	return (
		<Panel title={p.mergeBox} flush>
			<div className="flex flex-wrap items-center gap-3 px-3 py-3">
				<p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-14 font-medium">
					<StatusDot status={line.status} label={line.text} className="size-2.5" />
					{line.text}
				</p>
				{confirming ? (
					<RightButton
						right="code.merge"
						variant={risk ? "danger" : "secondary"}
						autoFocus
						onClick={confirm}
					>
						{risk ?? format(t.forge.confirmMerge, { method: t.forge.methods[current] })}
					</RightButton>
				) : (
					<SplitButton
						label={t.forge.merge}
						onClick={() => setConfirming(true)}
						disabled={off || right.disabled}
						reason={right.reason}
						moreLabel={t.forge.method}
						moreDisabled={off || right.disabled}
						// One method is no choice: no arrow, no menu.
						hideMore={d.mergeMethods.length <= 1}
						items={d.mergeMethods.map((m) => ({
							id: m,
							label: t.forge.methods[m],
							checked: m === current,
							onSelect: () => {
								setMethod(m);
								setConfirming(false);
							},
						}))}
					/>
				)}
			</div>
			<div className="flex flex-wrap gap-4 border-t px-3 py-3">
				<Segment
					label={t.forge.checks}
					value={count("passing")}
					max={d.checks.length}
					text={format(p.checkCounts, {
						passing: count("passing"),
						failing: count("failing"),
						pending: count("pending"),
					})}
					status={CI_STATUS[d.ci] ?? "idle"}
					statusLabel={t.forge.ci[d.ci as "none"]}
				/>
				<Segment
					label={p.comments}
					value={d.threads.length - open}
					max={d.threads.length}
					text={format(p.commentCounts, { open, total: d.threads.length })}
				/>
				<Segment
					label={p.approvals}
					value={approved.length}
					max={d.verdicts.length}
					text={format(p.approvalCounts, { approved: approved.length, total: d.verdicts.length })}
					title={approved.map((v) => v.reviewer).join(", ") || undefined}
					status={REVIEW_STATUS[review] ?? "idle"}
					statusLabel={t.forge.review[review]}
				/>
			</div>
			{d.state === "open" ? <ArchiveBar number={d.number} /> : null}
			<ErrorNotice error={failure} className="px-3 py-2" />
		</Panel>
	);
}
