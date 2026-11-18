import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { ENDED, useRunActions, useRuns, useWorkflow } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	type CompassEntry_Serialize as Entry,
	type Inspect_Serialize as Inspect,
	type WorkItemView_Serialize as Item,
	type SyncState,
	unwrap,
} from "@/lib/ipc";
import { projectKeys, useHealth } from "@/lib/projects";
import { RightButton, useRights } from "@/lib/rights";
import { useSpecsActions } from "@/lib/specs";
import { useBacklogActions, useWorkItems } from "@/lib/sync";
import { useWorkActions } from "@/lib/work";
import { money } from "@/lib/work/dates";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { LinkIcon, ShieldCheckIcon } from "@/ui/icons";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";

const STATUS = { current: "applied", stale: "stale", absent: "missing" } as const;
const TONE = { current: "success", stale: "warning", absent: "danger" } as const;
const key = (e: Entry) => `${e.kind}:${e.id}`;

/** The label of the ticket that fixes the findings: it finds the ticket again after a reload. */
const FIX_LABEL = "health-fix";
/** A ticket label `wf:<id>` picks the recipe of a run; the default of the project does it otherwise. */
const WORKFLOW_LABEL = "wf:";
const DEFAULT_WORKFLOW = "feature";
/** The rights that the action needs: the run, the ticket, the change. */
const FIX_NEEDS = ["runs.start", "work.edit", "specs.edit"] as const;
const NO_FILTER = {};

/**
 * "Check again" and "Fix all with an agent" (`spec:app-redesign#REQ-031`, `spec:app-redesign#REQ-033`).
 * The fix is "Build now" of Flow / New feature: a spec change and a ticket that list each finding, then
 * a run on the ticket. So it has the budget, the stall timeout, the approvals and the stop of every run.
 * One feature holds the fix: while its ticket is not done, a new start runs on that ticket.
 */
export function HealthActions() {
	const { t, lang } = useI18n();
	const d = t.doctor.fix;
	const qc = useQueryClient();
	// A missing tool is a finding of this computer: an agent in the project cannot install it.
	const findings = (useHealth().data ?? []).filter((f) => f.group !== "tools");
	const { gate } = useRights();
	const specs = useSpecsActions();
	const work = useWorkActions();
	const { adopt } = useBacklogActions();
	const runs = useRunActions();
	const items = useWorkItems(NO_FILTER);
	const all = useRuns();
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	});
	// The ticket of the fix: the label, or the title on an issue tracker that has no labels.
	const fixOf = (rows: Item[]) =>
		rows.find(
			(i) => i.category !== "done" && (i.labels.includes(FIX_LABEL) || i.title.startsWith(d.title)),
		);
	const ticket = fixOf(items.data ?? []);
	const live = ticket
		? all.data?.find((r) => r.key === ticket.key && !ENDED.includes(r.state))
		: undefined;
	// The recipe that the run takes, as the engine chooses it: its budget is the one of the confirmation.
	const recipeId =
		ticket?.labels.find((l) => l.startsWith(WORKFLOW_LABEL))?.slice(WORKFLOW_LABEL.length) ??
		settings.data?.file?.defaultWorkflow ??
		DEFAULT_WORKFLOW;
	const recipe = useWorkflow(recipeId);
	const budget = recipe.data?.limits.budget_usd ?? null;
	const { failure, busy, run: guard } = useGuard();
	const [asking, setAsking] = useState(false);
	// Until the tickets and the runs load, the view cannot say that no fix is in progress.
	const loading = items.isPending || all.isPending || settings.isPending || recipe.isPending;
	// A run with no budget does not start (`spec:app-redesign#REQ-033`).
	const off =
		FIX_NEEDS.map(gate).find((g) => g.disabled) ??
		(budget === null
			? { disabled: true as const, reason: format(d.noBudget, { recipe: recipeId }) }
			: undefined);
	const start = () =>
		guard(async () => {
			// A new read: a start that failed half-way left a change or a ticket.
			const rows = await unwrap(commands.syncItems(NO_FILTER));
			let key = fixOf(rows)?.key;
			if (!key) {
				const list = findings
					.map((f) => {
						const text = (t.health.finding as Record<string, string>)[f.code] ?? f.code;
						return `- ${format(text, { detail: f.detail ?? "" })}`;
					})
					.join("\n");
				// The change of a start that failed has no ticket: the new start takes it.
				const orphan = (await unwrap(commands.specsChanges())).find(
					(c) => c.title.startsWith(d.title) && !rows.some((i) => i.linked === `change:${c.id}`),
				);
				// The time makes the title new each time: a change id exists once.
				const change =
					orphan ??
					(await specs.createChange(
						`${d.title} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
					));
				const path = `${change.path}/proposal.md`;
				const file = await unwrap(commands.specsRead(path));
				if (!file.text.includes(d.why))
					await specs.write(path, `${file.text.trimEnd()}\n\n${d.why}\n\n${list}\n`, file.stamp);
				const row = await work.createItem({
					reference: `change:${change.id}`,
					kind: "story",
					title: change.title,
					description: list,
				});
				if (row.error || !row.key) throw new Error(row.error ?? "no ticket");
				key = row.key;
				// The new ticket is not in the mirror yet: a run needs it there.
				await adopt(key);
				// An issue tracker with no labels refuses the label: the title finds the ticket.
				await work.addLabel(key, FIX_LABEL).catch(() => undefined);
			}
			await runs.start(key);
		});
	const one = findings.length === 1;
	const open = ticket ? (
		<Link
			to="/flow/feature/$featureId"
			params={{ featureId: `wi:${ticket.key}` }}
			className="inline-flex min-h-control items-center px-2 text-ui text-accent-text hover:underline"
		>
			{d.open}
		</Link>
	) : null;
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				className="min-h-control"
				onClick={() => void qc.invalidateQueries({ queryKey: projectKeys.health })}
			>
				{d.again}
			</Button>
			{open}
			{live ? (
				<ConfirmButton
					className="min-h-control"
					{...gate("runs.start")}
					confirm={d.confirmStop}
					onConfirm={() => void guard(() => runs.cancel(live.id))}
				>
					{d.stop}
				</ConfirmButton>
			) : findings.length === 0 ? null : asking && budget !== null ? (
				<Button
					className="min-h-control"
					variant="primary"
					autoFocus
					onBlur={() => setAsking(false)}
					onClick={() => {
						setAsking(false);
						void start();
					}}
				>
					{format(one ? d.confirmOne : d.confirm, {
						count: findings.length,
						budget: money(budget, "USD", lang),
					})}
				</Button>
			) : (
				<Button
					className="min-h-control"
					variant="primary"
					busy={busy || loading}
					disabled={off !== undefined}
					reason={off?.reason}
					onClick={() => setAsking(true)}
				>
					{d.all}
				</Button>
			)}
			<ErrorNotice error={failure} className="w-full text-ui text-danger-text" />
		</div>
	);
}

/**
 * Settings / Health: each compass skill is applied, stale or missing, with its fix, and the
 * linked child projects take what the parent holds. Nothing is pushed.
 */
export function DoctorCompliance() {
	const { t } = useI18n();
	const d = t.doctor;
	const qc = useQueryClient();
	const compass = useQuery({
		queryKey: ["doctor", "skills"],
		queryFn: () => unwrap(commands.compassGet()),
	});
	const children = useQuery({
		queryKey: ["doctor", "children"],
		queryFn: () => unwrap(commands.childList()),
	});
	const [error, setError] = useState<unknown>(null);
	const [note, setNote] = useState<string | null>(null);
	const [inspected, setInspected] = useState<{ id: string; info: Inspect } | null>(null);
	const attempt = async (job: () => Promise<void>) => {
		setError(null);
		setNote(null);
		try {
			await job();
			await qc.invalidateQueries();
		} catch (e) {
			setError(e);
		}
	};
	const skills = (compass.data?.entries ?? []).filter((e) => e.kind === "skill");
	const linked = (children.data ?? []).filter((c) => c.cloned);
	if (!compass.data && linked.length === 0) return <HealthActions />;
	const fix = (e: Entry) =>
		attempt(async () => {
			if (e.state === "stale") await unwrap(commands.compassUpgrade([key(e)]));
			else await unwrap(commands.compassApply([key(e)]));
		});
	const bad = skills.filter((e) => e.state !== "current").length;
	return (
		<>
			<HealthActions />
			{compass.data ? (
				<Panel
					id="doctor-skills"
					title={d.skills.title}
					count={bad}
					icon={<ShieldCheckIcon size={14} />}
					tone={bad ? "warning" : "success"}
					flush
				>
					{skills.map((e) => (
						<div
							key={e.id}
							className="flex min-h-9 items-center gap-3 border-b px-3 py-1 last:border-b-0"
						>
							<span className="min-w-0 flex-1 truncate text-ui">{e.title}</span>
							<Badge variant={TONE[e.state as SyncState]}>
								{d.skills[STATUS[e.state as SyncState]]}
							</Badge>
							{e.state === "current" ? null : (
								<RightButton
									right="project.settings"
									variant="secondary"
									onClick={() => void fix(e)}
								>
									{format(e.state === "stale" ? d.skills.upgrade : d.skills.apply, {
										name: e.title,
									})}
								</RightButton>
							)}
						</div>
					))}
				</Panel>
			) : null}
			{linked.length > 0 ? (
				<Panel title={d.propagate.title} count={linked.length} icon={<LinkIcon size={14} />} flush>
					{linked.map((c) => (
						<div
							key={c.id}
							className="flex min-h-9 items-center gap-3 border-b px-3 py-1 last:border-b-0"
						>
							<span className="min-w-0 flex-1 truncate text-ui">{c.name}</span>
							<span className="text-12 text-n-11">
								{format(d.propagate.held, { held: String(c.held), total: String(c.total) })}
							</span>
							<Button
								variant="ghost"
								onClick={() =>
									void attempt(async () =>
										setInspected({ id: c.id, info: await unwrap(commands.gitLinkedInspect(c.id)) }),
									)
								}
							>
								{format(t.extras.linked.inspect, { name: c.name })}
							</Button>
							<Button
								variant="secondary"
								disabled={c.proposed.length === 0}
								onClick={() =>
									void attempt(async () => {
										const [r] = await unwrap(commands.childDeploy([c.id], c.proposed));
										if (r?.error) throw new Error(r.error);
										setNote(format(d.propagate.done, { name: c.name }));
									})
								}
							>
								{format(d.propagate.action, { name: c.name })}
							</Button>
						</div>
					))}
				</Panel>
			) : null}
			{inspected ? <LinkedState info={inspected.info} /> : null}
			{note ? (
				<p role="status" className="text-ui text-success-text">
					{note}
				</p>
			) : null}
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
		</>
	);
}

/** The state of a linked project at a glance: branch, distance to the server, changes, last commit. */
function LinkedState({ info }: { info: Inspect }) {
	const { t } = useI18n();
	const l = t.extras.linked;
	const rows: [string, string][] = [
		[l.branch, info.branch ?? l.none],
		[l.ahead, String(info.ahead)],
		[l.behind, String(info.behind)],
		[l.changes, String(info.changes)],
		[l.stashes, String(info.stashes)],
		[l.last, info.last ?? l.none],
	];
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-ui">
			{rows.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-n-11">{k}</dt>
					<dd className="min-w-0 truncate">{v}</dd>
				</div>
			))}
		</dl>
	);
}
