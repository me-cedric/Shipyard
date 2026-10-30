import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	type MergeMethod,
	type PullDetail,
	useForgeActions,
	usePull,
	usePullLabels,
	usePulls,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { Textarea } from "@/ui/atoms/textarea";
import { ArrowsRightLeftIcon, CheckIcon, PlusIcon } from "@/ui/icons";
import { DiffView } from "@/ui/molecules/diff-view";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FileRow, type FileState } from "@/ui/molecules/file-row";
import { GroupSection } from "@/ui/molecules/group-section";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { PullRow } from "@/ui/molecules/pull-row";
import { RefChip } from "@/ui/molecules/ref-chip";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { Dialog } from "@/ui/organisms/dialog";
import { PrAi } from "./pr-ai";
import { withProject } from "./project-gate";
import { CI_STATUS, REVIEW_STATUS } from "./status";
import { useRun } from "./use-run";
import { FileDialog } from "./viewer";

const STATES = ["open", "merged", "closed"] as const;
const FILE_STATE: Record<string, FileState> = {
	added: "added",
	modified: "modified",
	removed: "deleted",
	renamed: "renamed",
};

const Alert = ({ error }: { error: string | null }) =>
	error ? (
		<p role="alert" className="px-3 py-2 text-ui text-danger-text">
			{error}
		</p>
	) : null;

/** The form of REQ-020: a title, a description, a base, a draft option and labels that exist. */
function OpenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
	const { t } = useI18n();
	const { open: openPull } = useForgeActions();
	const known = usePullLabels().data ?? [];
	const { error, run } = useRun();
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [base, setBase] = useState("");
	const [draft, setDraft] = useState(false);
	const [labels, setLabels] = useState<string[]>([]);
	const [missing, setMissing] = useState<string[]>([]);
	const [labelError, setLabelError] = useState<string | null>(null);
	// The pull request exists once the call returns: a second click would open a duplicate.
	const [created, setCreated] = useState(false);
	const submit = () =>
		void run(async () => {
			const out = await openPull({ title, body, base: base.trim() || null, draft, labels });
			setCreated(true);
			setMissing(out.missingLabels);
			setLabelError(out.labelError);
			if (out.missingLabels.length === 0 && !out.labelError) onOpenChange(false);
		});
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title={t.forge.openPull}
			actions={
				<Button variant="primary" onClick={submit} disabled={created}>
					<PlusIcon size={14} />
					{t.forge.openPull}
				</Button>
			}
		>
			<Input label={t.forge.title} value={title} onChange={(e) => setTitle(e.target.value)} />
			<Textarea
				label={t.forge.description}
				value={body}
				onChange={(e) => setBody(e.target.value)}
			/>
			<Input label={t.forge.base} value={base} onChange={(e) => setBase(e.target.value)} />
			<section aria-label={t.forge.labels} className="flex items-center gap-1">
				{known.map((l) => (
					<Button
						key={l}
						variant={labels.includes(l) ? "secondary" : "ghost"}
						aria-pressed={labels.includes(l)}
						onClick={() =>
							setLabels((cur) => (cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]))
						}
					>
						{labels.includes(l) ? <CheckIcon size={12} /> : null}
						{l}
					</Button>
				))}
			</section>
			<Button
				variant={draft ? "secondary" : "ghost"}
				aria-pressed={draft}
				onClick={() => setDraft(!draft)}
			>
				{t.forge.draft}
			</Button>
			{missing.length ? (
				<p role="status" className="text-ui text-warning-text">
					{format(t.forge.missingLabels, { names: missing.join(", ") })}
				</p>
			) : null}
			<Alert error={error ?? labelError} />
		</Dialog>
	);
}

/** Merge names its method in a confirmation. It stays off for a draft or a pull request that is not open. */
function MergeBar({ d }: { d: PullDetail }) {
	const { t } = useI18n();
	const { merge, ready } = useForgeActions();
	const { error, run } = useRun();
	const [method, setMethod] = useState<MergeMethod | null>(null);
	const [confirming, setConfirming] = useState(false);
	const current = method ?? d.mergeMethods[0] ?? "merge";
	const review = d.verdicts.some((v) => v.state === "changes-requested")
		? "changes_requested"
		: "clear";
	return (
		<div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
			<StatusDot status={CI_STATUS[d.ci] ?? "idle"} label={t.forge.ci[d.ci as "none"]} />
			<StatusDot status={REVIEW_STATUS[review] ?? "idle"} label={t.forge.review[review]} />
			{d.draft ? (
				<Button onClick={() => void run(() => ready(d.number))}>
					<CheckIcon size={14} />
					{t.forge.markReady}
				</Button>
			) : null}
			<Select
				label={t.forge.method}
				items={d.mergeMethods.map((m) => ({ value: m, label: t.forge.methods[m] }))}
				value={current}
				onValueChange={(v) => {
					setMethod(v as MergeMethod);
					setConfirming(false);
				}}
				className="min-w-28"
			/>
			{confirming ? (
				<Button
					onClick={() =>
						void run(async () => {
							setConfirming(false);
							await merge(d.number, current);
						})
					}
				>
					{format(t.forge.confirmMerge, { method: t.forge.methods[current] })}
				</Button>
			) : (
				<Button disabled={d.draft || d.state !== "open"} onClick={() => setConfirming(true)}>
					{t.forge.merge}
				</Button>
			)}
			<Alert error={error} />
		</div>
	);
}

/** The comment box with the verdicts. A request for changes needs the text: the call refuses without it. */
function Reply({ number }: { number: number }) {
	const { t } = useI18n();
	const { comment, verdict } = useForgeActions();
	const { error, run } = useRun();
	const [body, setBody] = useState("");
	const send = (job: () => Promise<unknown>) =>
		void run(async () => {
			await job();
			setBody("");
		});
	return (
		<div className="flex flex-col gap-2 px-3 py-2">
			<Textarea label={t.forge.comment} value={body} onChange={(e) => setBody(e.target.value)} />
			<div className="flex gap-2">
				<Button onClick={() => send(() => comment(number, body))}>{t.forge.comment}</Button>
				<Button onClick={() => send(() => verdict(number, "approve", body))}>
					{t.forge.approve}
				</Button>
				<Button onClick={() => send(() => verdict(number, "request-changes", body))}>
					{t.forge.requestChanges}
				</Button>
			</div>
			<Alert error={error} />
		</div>
	);
}

/** One pull request: description, links, files with a diff, commits, checks, conversation, verdicts. */
function Detail({ number }: { number: number }) {
	const { t } = useI18n();
	const d = usePull(number).data;
	const [file, setFile] = useState<string | null>(null);
	const [viewing, setViewing] = useState<string | null>(null);
	if (!d) return null;
	const current = d.files.find((f) => f.path === file) ?? d.files[0];
	return (
		<div>
			<div className="flex flex-col gap-2 border-b px-4 py-3">
				<h2 className="text-16 font-semibold text-n-12">{d.title}</h2>
				<p className="flex flex-wrap items-center gap-2 text-12 text-n-11">
					<Avatar name={d.author} className="size-5" />
					{d.author}
					<Badge className="font-mono">{d.sourceBranch}</Badge>→
					<Badge className="font-mono">{d.targetBranch}</Badge>
				</p>
				<p className="text-ui whitespace-pre-wrap text-n-12">{d.description}</p>
				<div className="flex flex-wrap gap-1 pt-1">
					{d.links.map((l) => (
						<RefChip key={l} refId={l} state="resolved" />
					))}
				</div>
			</div>
			<MergeBar key={`${d.number}${d.state}${d.draft}`} d={d} />
			<PrAi d={d} />
			<GroupSection name={t.forge.files} count={d.files.length}>
				{d.files.map((f) => (
					<FileRow
						key={f.path}
						name={f.path}
						state={FILE_STATE[f.status]}
						stateLabel={f.status}
						selected={f.path === current?.path}
						onSelect={() => setFile(f.path)}
					/>
				))}
			</GroupSection>
			{current ? (
				<div className="px-3 py-1">
					<Button variant="ghost" onClick={() => setViewing(current.path)}>
						{format(t.forge.openFile, { path: current.path })}
					</Button>
				</div>
			) : null}
			{current?.patch ? (
				<DiffView
					text={current.patch}
					label={format(t.forge.diff, { path: current.path })}
					binaryLabel=""
					truncatedLabel=""
				/>
			) : null}
			<GroupSection name={t.forge.commits} count={d.commits.length}>
				{d.commits.map((c) => (
					<div key={c.reference} className="flex min-h-row items-center gap-2 px-3 text-ui">
						<RefChip refId={c.reference} state="resolved" />
						<span className="truncate">{c.summary}</span>
					</div>
				))}
			</GroupSection>
			<GroupSection name={t.forge.checks} count={d.checks.length}>
				{d.checks.map((c) => (
					<div key={c.name} className="flex min-h-row items-center gap-2 px-3 text-ui">
						<StatusDot
							status={CI_STATUS[c.state] ?? "idle"}
							label={t.forge.check[c.state as "passing"]}
						/>
						{c.name}
					</div>
				))}
			</GroupSection>
			<GroupSection name={t.forge.verdicts} count={d.verdicts.length}>
				{d.verdicts.map((v) => (
					<div key={v.reviewer} className="flex min-h-row items-center gap-2 px-3 text-ui">
						<StatusDot
							status={REVIEW_STATUS[v.state] ?? "idle"}
							label={t.forge.verdict[v.state as "approved"]}
						/>
						{v.reviewer}
					</div>
				))}
			</GroupSection>
			<GroupSection name={t.forge.threads} count={d.threads.length}>
				{d.threads.map((th) => (
					<div key={th.id} className="border-b px-3 py-1 text-ui">
						{th.path ? (
							<p className="font-mono text-12 text-n-11">
								{th.path}
								{th.line ? `:${th.line}` : ""}
							</p>
						) : null}
						{th.comments.map((c) => (
							<p key={c}>{c}</p>
						))}
					</div>
				))}
			</GroupSection>
			<Reply number={d.number} />
			{viewing ? <FileDialog path={viewing} onClose={() => setViewing(null)} /> : null}
		</div>
	);
}

function PullRequestsView() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const pulls = usePulls();
	const [selected, setSelected] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);
	const rows = pulls.data;
	const number = rows?.find((r) => r.reference === selected)?.number ?? null;
	if (!rows) return null;
	if (rows.length === 0)
		return (
			<div className="flex flex-col">
				<PageHeader icon={<ArrowsRightLeftIcon size={16} />} title={t.tabs.code["pull-requests"]} />
				<EmptyState
					action={{
						label: t.forge.connect,
						onClick: () => void navigate({ to: "/settings/connections" }),
					}}
				/>
			</div>
		);
	const open = rows.filter((r) => r.state === "open");
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<ArrowsRightLeftIcon size={16} />}
				title={t.tabs.code["pull-requests"]}
				count={rows.length}
				action={
					<Button variant="primary" onClick={() => setOpening(true)}>
						<PlusIcon size={14} />
						{t.forge.openPull}
					</Button>
				}
			/>
			<StatStrip
				className="px-4"
				items={[
					{ label: t.forge.state.open, value: String(open.length), tone: "accent" },
					{
						label: t.forge.draft,
						value: String(open.filter((r) => r.draft).length),
						tone: "info",
					},
					{
						label: t.forge.ci.failing,
						value: String(open.filter((r) => r.ci === "failing").length),
						tone: "danger",
					},
					{
						label: t.forge.review.changes_requested,
						value: String(open.filter((r) => r.review === "changes_requested").length),
						tone: "warning",
					},
				]}
			/>
			<div className="flex min-h-0 flex-1 gap-3 px-4 pt-3 pb-4">
				<div className="flex w-[30rem] shrink-0 flex-col gap-3 overflow-y-auto">
					{STATES.map((s) => {
						const items = rows.filter((r) => r.state === s);
						return (
							<Panel
								key={s}
								title={t.forge.state[s]}
								count={items.length}
								tone={s === "open" ? "accent" : s === "merged" ? "success" : "neutral"}
								flush
								className="shrink-0"
							>
								{items.map((r) => (
									<PullRow
										key={r.reference}
										reference={`#${r.number}`}
										title={r.title}
										draft={r.draft ? t.forge.draft : undefined}
										ci={CI_STATUS[r.ci] ?? "idle"}
										ciLabel={t.forge.ci[r.ci as "none"]}
										review={REVIEW_STATUS[r.review] ?? "idle"}
										reviewLabel={t.forge.review[r.review as "clear"]}
										meta={<span className="font-mono">{r.updated.slice(0, 10)}</span>}
										selected={r.reference === selected}
										onSelect={() => setSelected(r.reference)}
									/>
								))}
							</Panel>
						);
					})}
				</div>
				<div className="min-w-0 flex-1 overflow-auto rounded-lg border bg-surface-1 shadow-1">
					{number ? <Detail number={number} /> : null}
				</div>
			</div>
			{opening ? <OpenDialog open onOpenChange={setOpening} /> : null}
		</div>
	);
}

export const PullRequests = withProject(PullRequestsView);
