import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { webUrl } from "@/features/factory/runs/run-summary";
import { type MergeMethod, type PullDetail, useForgeActions } from "@/lib/code";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { commands, toFailure, unwrap } from "@/lib/ipc";
import { copyText, openUrl } from "@/lib/menus";
import { useNotifications } from "@/lib/notifications";
import { RightButton, useRights } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { linkClass } from "@/ui/atoms/link-button";
import { Progress } from "@/ui/atoms/progress";
import { Select } from "@/ui/atoms/select";
import { type Status, StatusDot } from "@/ui/atoms/status-dot";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { MenuButton } from "@/ui/molecules/menu-button";
import { CloseConfirm } from "./close-confirm";
import { defaultMergeMethod } from "./merge-default";
import { FitSegmented } from "./fit-segmented";
import { focusPullTitle } from "./focus-title";
import { usePullAsk } from "./pull-ask";
import { useRun } from "./use-run";

/**
 * Archives a spec change in the branch of the pull request: one commit and a push. A change with
 * open items asks for a second click that says so. It is on the changed files page, under the commits.
 */
export function ArchiveBar({ number }: { number: number }) {
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
		<Card pad className="flex flex-wrap items-center gap-2.5">
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
		</Card>
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

/** The three bars of the merge summary: what is done of what the merge needs. */
function barsOf(d: PullDetail, t: Messages) {
	const x = t.flow.look.pull;
	const count = (state: string) => d.checks.filter((c) => c.state === state).length;
	const open = d.threads.filter((th) => !th.resolved).length;
	return [
		{
			label: t.forge.checks,
			done: count("passing"),
			total: d.checks.length,
			text: x.checksPass,
			over: count("failing") > 0,
			// The words of the three counts, for a screen reader: the bar says only the passing ones.
			detail: format(t.forge.pullPage.checkCounts, {
				passing: count("passing"),
				failing: count("failing"),
				pending: count("pending"),
			}),
		},
		{
			label: t.forge.pullPage.comments,
			done: d.threads.length - open,
			total: d.threads.length,
			text: x.commentsSolved,
			over: false,
			detail: null,
		},
		{
			label: t.forge.pullPage.approvals,
			done: d.verdicts.filter((v) => v.state === "approved").length,
			total: d.verdicts.length,
			text: x.approvalsDone,
			over: false,
			detail: null,
		},
	];
}

/** The bars that are not full, for an open pull request that is not a draft. Else 0: the status line says the state. */
const stepsOf = (d: PullDetail, t: Messages) =>
	d.state === "open" && !d.draft ? barsOf(d, t).filter((b) => b.done < b.total).length : 0;

/**
 * The merge summary (REQ-043): the count of steps before the merge, else the status line, then the
 * three bars. "Fix with an agent" opens the assistant with the failing checks and the open comments.
 */
export function MergeSummary({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const x = t.flow.look.pull;
	const askPull = usePullAsk(d);
	const steps = stepsOf(d, t);
	const fixable =
		steps > 0 &&
		(d.checks.some((c) => c.state === "failing") || d.threads.some((th) => !th.resolved));
	return (
		<Card
			pad
			role="region"
			aria-label={t.forge.pullPage.mergeBox}
			className="flex flex-wrap items-center gap-6"
		>
			<p
				role="status"
				className="flex flex-[1_1_200px] items-center gap-3 text-20 font-semibold text-n-12"
			>
				{steps === 0 ? (
					<StatusDot status={mergeStatus(d, t).status} label={mergeStatus(d, t).text} />
				) : null}
				{steps === 0
					? mergeStatus(d, t).text
					: steps === 1
						? x.stepsOne
						: format(x.stepsMany, { count: steps })}
			</p>
			{barsOf(d, t).map((b) => (
				<div key={b.label} className="flex min-w-0 flex-[1_1_150px] flex-col gap-2">
					<span className="font-semibold">{b.label}</span>
					<Progress value={b.done} max={b.total} label={b.label} over={b.over} />
					<span className="text-n-11">{format(b.text, { done: b.done, total: b.total })}</span>
					{b.detail ? <span className="sr-only">{b.detail}</span> : null}
				</div>
			))}
			{fixable ? (
				<Button variant="primary" onClick={() => askPull(x.fixPrompt, x.none)}>
					{x.fix}
				</Button>
			) : null}
		</Card>
	);
}

/**
 * The merge card (REQ-043): the method, the merge action, the branches and the impact report. Merge
 * names its method in a confirmation. Failing checks or requested changes make the confirmation a
 * danger action that names the risk. Merge stays off for a draft or a pull request that is not open.
 * More holds the actions of the state (mark ready, close), the web page, the ref and two questions
 * to the assistant.
 */
export function MergeCard({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const p = t.forge.pullPage;
	const x = t.flow.look.pull;
	const { merge, ready, close } = useForgeActions();
	const { push } = useNotifications();
	const { gate } = useRights();
	const { failure, busy, run } = useRun();
	const router = useRouter();
	const askPull = usePullAsk(d);
	const [method, setMethod] = useState<MergeMethod | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [closing, setClosing] = useState(false);
	const current = method ?? defaultMergeMethod(d.mergeMethods);
	const risk =
		d.ci === "failing"
			? t.forge.confirmFailing
			: d.verdicts.some((v) => v.state === "changes-requested")
				? t.forge.confirmChanges
				: null;
	const line = mergeStatus(d, t);
	const off = d.draft || d.state !== "open";
	const link = webUrl(d.url);
	// shortcut: the route of the impact report belongs to another group, so the address is plain text; use a typed link when the route is in the router.
	const report = `/flow/feature/${encodeURIComponent(d.reference)}/impact-report`;
	const reason = useId();
	const slot = useRef<HTMLDivElement>(null);
	const back = useRef(false);
	// Cancel puts the focus back on Merge.
	useEffect(() => {
		if (confirming || !back.current) return;
		back.current = false;
		slot.current?.querySelector("button")?.focus();
	}, [confirming]);
	// The confirmation stays, busy, until the call ends: a second click cannot merge twice.
	const confirm = () =>
		void run(async () => {
			try {
				await merge(d.number, current);
				void push({
					id: `pull-merged:${d.reference}`,
					kind: "info",
					title: format(p.mergedNotice, { number: d.number, method: t.forge.methods[current] }),
				});
				focusPullTitle();
			} finally {
				setConfirming(false);
			}
		});
	return (
		<Card pad role="region" aria-label={t.forge.merge} className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2.5 empty:hidden">
				{/* One method is no choice: no switch. */}
				{d.mergeMethods.length > 1 ? (
					// A viewer cannot merge: the methods go off with Merge (a disabled fieldset turns its buttons off).
					<fieldset
						disabled={gate("code.merge").disabled}
						title={gate("code.merge").reason}
						className="m-0 w-fit min-w-0 border-0 p-0"
					>
						<FitSegmented
							label={t.forge.method}
							value={current}
							onValueChange={setMethod}
							items={d.mergeMethods.map((m) => ({ value: m, label: t.forge.methods[m] }))}
						/>
					</fieldset>
				) : null}
				{closing ? (
					<CloseConfirm
						number={d.number}
						onCancel={() => setClosing(false)}
						onConfirm={() =>
							void run(async () => {
								setClosing(false);
								await close(d.number, "");
								focusPullTitle();
							})
						}
					/>
				) : null}
			</div>
			<div ref={slot} className="flex flex-col gap-2.5 [&>span]:flex [&_button]:w-full">
				{confirming ? (
					<>
						<RightButton
							right="code.merge"
							variant={risk ? "danger" : "secondary"}
							autoFocus
							busy={busy}
							onClick={confirm}
						>
							{format(risk ?? t.forge.confirmMerge, { method: t.forge.methods[current] })}
						</RightButton>
						<Button
							disabled={busy}
							onClick={() => {
								back.current = true;
								setConfirming(false);
							}}
						>
							{t.forge.pullInline.cancel}
						</Button>
					</>
				) : (
					<RightButton
						right="code.merge"
						variant={line.status === "success" ? "primary" : "secondary"}
						aria-label={x.mergePull}
						aria-describedby={stepsOf(d, t) > 0 ? reason : undefined}
						disabled={off}
						onClick={() => setConfirming(true)}
					>
						{t.forge.merge}
					</RightButton>
				)}
			</div>
			{/* With steps left, the summary shows their count: the reason in words describes Merge. */}
			{stepsOf(d, t) > 0 ? (
				<span id={reason} role="status" className="sr-only">
					{line.text}
				</span>
			) : null}
			<span className="font-mono text-14 text-n-11 [overflow-wrap:anywhere]">
				{format(x.branches, { source: d.sourceBranch, target: d.targetBranch })}
			</span>
			<div className="flex items-center justify-between gap-2.5">
				<a
					href={report}
					onClick={(e) => {
						e.preventDefault();
						router.history.push(report);
					}}
					className={linkClass}
				>
					{x.impactReport}
				</a>
				{closing ? null : (
					<MenuButton
						iconOnly
						label={t.ui.more}
						icon={<span aria-hidden="true">···</span>}
						items={[
							...(d.state === "open" && d.draft
								? [
										{
											id: "ready",
											label: t.forge.markReady,
											...gate("code.write"),
											onSelect: () => void run(() => ready(d.number)),
										},
									]
								: []),
							{
								id: "review",
								label: x.askReview,
								onSelect: () => askPull(t.workspace.pr.prompt.review),
							},
							{
								id: "reply",
								label: x.askReply,
								onSelect: () => askPull(t.workspace.pr.prompt.reply),
							},
							{
								id: "browser",
								label: p.openInBrowser,
								disabled: !link,
								onSelect: () => link && openUrl(link),
							},
							{ id: "copy", label: t.context.copyRef, onSelect: () => void copyText(d.reference) },
							...(d.state === "open"
								? [
										{
											id: "close",
											label: t.forge.close,
											danger: true,
											...gate("code.write"),
											onSelect: () => setClosing(true),
										},
									]
								: []),
						]}
					/>
				)}
			</div>
			<ErrorNotice error={failure} />
		</Card>
	);
}
