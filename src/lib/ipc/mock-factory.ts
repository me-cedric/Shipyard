// The mock of the factory commands. It applies the rules of `crates/shipyard-app/src/factory.rs`
// and the run table of `shipyard-core`: the lane comes from the state and the pull request, a
// final run takes no event, one answer closes a question, an invalid workflow file is refused.
// The demo data set (`seedFactory`) has a run in every lane and belongs to the first project that
// reads it, so each build and test sees it whatever folder it opens.
import type {
	AgentRole_Serialize,
	ApprovalView,
	AskedQuestion_Serialize,
	Effort,
	FindingView_Serialize,
	Gate,
	IssueView_Serialize,
	Lane,
	MessageView,
	Mode,
	PrRowView,
	QuestionChoice,
	QuestionView_Serialize,
	RoleFile_Serialize,
	RoleItem_Serialize,
	RunLogEvent_Serialize,
	RunLogPage_Serialize,
	RunnerTiers,
	RunState,
	RunView_Serialize,
	Step_Serialize,
	StepState,
	StepView,
	UnitView,
	Workflow_Serialize,
	WorkflowFile_Serialize,
	WorkflowItem_Serialize,
	WorkflowLimits,
	WorkItemView_Serialize,
	Workspace,
} from "./bindings";
import { FAKE_TICKETS } from "./mock-sync";

const WF_DIR = ".shipyard/workflows";
const ROLE_DIR = ".shipyard/roles";
const MAX_FILE = 64 * 1024;
const MAX_PAGE = 500;
const FINAL: RunState[] = ["Failed", "Cancelled", "Done"];
const SIDE: RunState[] = ["WaitingForAnswer", "Blocked", "RetryQueued", "Paused"];
/** The writes that need a live pull request (`is_delivery` of the engine). */
const DELIVERY = ["push", "open_pr", "resolve_threads"];

/** The lane of every state but `PROpen` (`shipyard_core::delivery::lane`). */
const LANE: Record<Exclude<RunState, "PROpen">, Lane> = {
	Queued: "queued",
	Claimed: "queued",
	RetryQueued: "queued",
	Planning: "working",
	Working: "working",
	SelfReview: "working",
	ChangesRequested: "working",
	PlanReview: "needs_you",
	WaitingForAnswer: "needs_you",
	Blocked: "needs_you",
	Paused: "needs_you",
	Failed: "needs_you",
	Merged: "done",
	Done: "done",
	Cancelled: "done",
};

// ------------------------------------------------------------------ default files

const WORKFLOWS: Record<string, string> = {
	bug: `# A bug: triage, fix, review, open a pull request. No plan gate.
id: bug
steps:
  - id: triage
    role: triager
    model: small
    effort: low
    mode: plan
    tools: [read_ticket, read_ref, ask_question, post_progress, report]
  - id: fix
    role: worker
    model: mid
    effort: medium
    needs: [triage]
    workspace: worktree
    retry: 2
    tools: [read_ticket, read_ref, ask_question, post_progress, handoff, report]
  - id: review
    role: reviewer
    model: top
    effort: high
    mode: plan
    needs: [fix]
    fresh_context: true
    max_rounds: 2
    tools: [read_ref, post_progress, report]
  - id: pr
    action: open_pr
    needs: [review]
limits:
  max_turns: 30
  budget_usd: 3
  stall_s: 300
`,
	feature: `# A feature: grill, plan behind a human gate, build in parallel, review, open a pull request.
id: feature
steps:
  - id: grill
    role: planner
    model: top
    effort: high
    skill: grill-me
    mode: plan
    tools: [read_ticket, read_ref, ask_question, post_progress, report]
  - id: plan
    role: planner
    model: top
    effort: high
    mode: plan
    needs: [grill]
    gate: human
    tools: [read_ticket, read_ref, ask_question, post_progress, report]
  - id: build
    role: worker
    model: mid
    effort: medium
    needs: [plan]
    workspace: worktree
    for_each: plan.tasks
    max_parallel: 2
    retry: 2
    tools: [read_ticket, read_ref, ask_question, post_progress, handoff, report]
  - id: review
    role: reviewer
    model: top
    effort: high
    mode: plan
    needs: [build]
    fresh_context: true
    max_rounds: 2
    tools: [read_ref, post_progress, report]
  - id: pr
    action: open_pr
    needs: [review]
limits:
  max_turns: 40
  budget_usd: 5
  stall_s: 300
`,
	"review-only": `# A review: review an existing branch in a fresh context, then report.
id: review-only
steps:
  - id: review
    role: reviewer
    model: top
    effort: high
    mode: plan
    fresh_context: true
    max_rounds: 2
    tools: [read_ticket, read_ref, post_progress, report]
  - id: report
    role: docs
    model: mid
    effort: medium
    needs: [review]
    tools: [read_ref, post_progress, report]
limits:
  max_turns: 20
  budget_usd: 2
  stall_s: 300
`,
	"spec-split": `# A split: read a change, propose work items, wait for a person.
id: spec-split
steps:
  - id: read
    role: scout
    model: small
    effort: low
    mode: plan
    tools: [read_ticket, read_ref, report]
  - id: propose
    role: planner
    model: top
    effort: high
    mode: plan
    needs: [read]
    gate: human
    tools: [read_ref, ask_question, post_progress, report]
limits:
  max_turns: 20
  budget_usd: 2
  stall_s: 300
`,
	spike: `# A spike: grill, investigate, report. No pull request.
id: spike
steps:
  - id: grill
    role: planner
    model: top
    effort: high
    skill: grill-me
    mode: plan
    tools: [read_ticket, read_ref, ask_question, post_progress, report]
  - id: investigate
    role: scout
    model: small
    effort: low
    mode: plan
    needs: [grill]
    tools: [read_ticket, read_ref, post_progress, report]
  - id: report
    role: docs
    model: mid
    effort: medium
    needs: [investigate]
    tools: [read_ref, post_progress, report]
limits:
  max_turns: 30
  budget_usd: 2
  stall_s: 300
`,
};

/** The seven default roles, in the order of `DEFAULT_ROLES`: id, description, tier, effort, body. */
const ROLES: [string, string, string, Effort, string][] = [
	[
		"scout",
		"Read-only lookup. Finds files, symbols and facts and returns short answers with paths.",
		"small",
		"low",
		"You are the scout. You find facts. You do not edit files.\n\n- Search first. Then read only the lines that you need.\n- Give each fact with its `path:line`.",
	],
	[
		"worker",
		"Makes one bounded change on named files, runs the named checks and reports the result.",
		"mid",
		"medium",
		"You are a worker. You make one bounded change in your own worktree.\n\n- Edit only the files that the task names. Do not commit, push or open a pull request.\n- Run the checks that the task names.",
	],
	[
		"reviewer",
		"Reviews a diff in a fresh context for correctness, task match and missing tests. Does not edit files.",
		"top",
		"high",
		"You are the reviewer. You did not write this change.\n\n- Read the diff against the base and the files that it touches.\n- Do not edit files. Do not report style preferences.",
	],
	[
		"planner",
		"Reads the ticket, asks the open questions, and splits the work into tasks that a worker can do alone.",
		"top",
		"high",
		"You are the planner. You do not edit files.\n\n- Step `grill`: call `ask_question` once for each open high-impact item.\n- Step `plan`: split the work into tasks. A person approves the plan before any worker starts.",
	],
	[
		"tester",
		"Writes or runs tests for a named behavior and reports which behavior passes or fails.",
		"mid",
		"medium",
		"You are the tester. You write the failing test first, and you run the checks.\n\n- Test the behavior that the task names. Do not change production code.",
	],
	[
		"docs",
		"Writes or updates documentation, specs and changelog lines to match the code.",
		"mid",
		"medium",
		"You are the docs writer. You keep text and code in agreement.\n\n- Read the code first. Write only what the code does.",
	],
	[
		"triager",
		"Reads a bug ticket, finds its likely cause and the files involved, and sets its scope.",
		"small",
		"low",
		"You are the triager. You do not edit files.\n\n- Give the likely cause with `path:line`. Say how sure you are.",
	],
];
const DEFAULT_ROLES = ROLES.map(([id]) => id);

const roleText = ([id, description, model, effort, body]: (typeof ROLES)[number]) =>
	`---\nname: ${id}\ndescription: ${description}\nmodel: ${model}\neffort: ${effort}\n---\n\n${body}\n`;

// ------------------------------------------------------------------ file checks

const issue = (file: string, line: number | null, message: string): IssueView_Serialize => ({
	file,
	line,
	message,
});

/** The text of a refusal, as the write commands give it. */
const refusal = (i: IssueView_Serialize) =>
	i.line === null ? `${i.file}: ${i.message}` : `${i.file}:${i.line}: ${i.message}`;

const list = (v: string) =>
	v
		.replace(/^\[|\]$/g, "")
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);

/** A parser for the workflow files of the factory: the `- id:` steps, flat fields and `limits`. */
function parseWorkflow(
	id: string,
	text: string,
	roles: string[],
): { workflow: Workflow_Serialize | null; issue: IssueView_Serialize | null } {
	const file = `${WF_DIR}/${id}.yaml`;
	const refuse = (line: number | null, message: string) => ({
		workflow: null,
		issue: issue(file, line, message),
	});
	type Field = { v: string; line: number };
	const raws: Record<string, Field>[] = [];
	const limits: WorkflowLimits = { max_turns: 30, budget_usd: null, stall_s: 300 };
	let fileId: Field | null = null;
	let inLimits = false;
	for (const [i, l] of text.split("\n").entries()) {
		if (!l.trim() || l.trim().startsWith("#")) continue;
		const at = (v: string): Field => ({ v: v.trim(), line: i + 1 });
		const top = /^id:\s*(\S+)/.exec(l);
		const step = /^\s*-\s*id:\s*(\S+)/.exec(l);
		const [, k, v] = /^\s+(\w+):\s*(.*)$/.exec(l) ?? [];
		if (top?.[1]) fileId = at(top[1]);
		else if (/^limits:/.test(l)) inLimits = true;
		else if (/^steps:/.test(l)) inLimits = false;
		else if (step?.[1]) raws.push({ id: at(step[1]) });
		else if (k && inLimits) Object.assign(limits, { [k]: Number(v) });
		else if (k) {
			const raw = raws.at(-1);
			if (raw) raw[k] = at(v ?? "");
		}
	}
	if (!fileId) return refuse(null, "the file has no `id`");
	if (fileId.v !== id)
		return refuse(fileId.line, `id \`${fileId.v}\` differs from the file name \`${id}\``);
	if (raws.length === 0) return refuse(null, "the workflow has no step");
	for (const raw of raws) {
		const role = raw.role;
		if (role && !roles.includes(role.v))
			return refuse(
				role.line,
				`step \`${raw.id?.v}\` names the role \`${role.v}\`, which has no file in ${ROLE_DIR} and is not a default role`,
			);
	}
	const steps = raws.map((raw): Step_Serialize => {
		const s = (k: string) => raw[k]?.v;
		const step: Step_Serialize = {
			id: s("id") ?? "",
			mode: (s("mode") ?? "auto") as Mode,
			workspace: (s("workspace") ?? "none") as Workspace,
			gate: (s("gate") ?? "none") as Gate,
			retry: Number(s("retry") ?? 0),
			fresh_context: s("fresh_context") === "true",
			budget: null,
			needs: list(s("needs") ?? ""),
			tools: list(s("tools") ?? ""),
		};
		for (const k of ["role", "model", "effort", "skill", "for_each", "action"])
			if (s(k)) Object.assign(step, { [k]: s(k) });
		for (const k of ["max_parallel", "max_rounds", "timeout"])
			if (s(k)) Object.assign(step, { [k]: Number(s(k)) });
		return step;
	});
	return { workflow: { id, steps, limits }, issue: null };
}

function parseRole(
	id: string,
	text: string,
): { role: AgentRole_Serialize | null; issue: IssueView_Serialize | null } {
	const lines = text.split("\n");
	const fm: Record<string, { v: string; line: number }> = {};
	let prompt = text;
	const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
	if (lines[0]?.trim() === "---" && end > 0) {
		for (let i = 1; i < end; i++) {
			const [, k, v] = /^(\w+):\s*(.*)$/.exec(lines[i] ?? "") ?? [];
			if (k) fm[k] = { v: (v ?? "").trim(), line: i + 1 };
		}
		prompt = lines
			.slice(end + 1)
			.join("\n")
			.trim();
	}
	const name = fm.name;
	if (name && name.v !== id)
		return {
			role: null,
			issue: issue(
				`${ROLE_DIR}/${id}.md`,
				name.line,
				`name \`${name.v}\` differs from the file name \`${id}\``,
			),
		};
	return {
		role: {
			id,
			description: fm.description?.v ?? "",
			model: fm.model?.v || null,
			effort: (fm.effort?.v || null) as Effort | null,
			prompt,
		},
		issue: null,
	};
}

/** A workflow or role id becomes a file name (`file_id` of the commands). */
const fileId = (id: string) => {
	if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw `\`${id}\` is not an id: use a-z, 0-9, - and _`;
	return id;
};
const tooBig = (text: string) => {
	if (new TextEncoder().encode(text).length > MAX_FILE)
		throw `the file is over ${MAX_FILE / 1024} KiB`;
};

// ------------------------------------------------------------------ state

type Rec = {
	id: string;
	project: string;
	key: string;
	title: string;
	url: string;
	workflow: string;
	state: RunState;
	returnTo: RunState | null;
	/** The number of its pull request in `pulls`. */
	pr: number | null;
	costUsd: number;
	tokens: number;
	turns: number;
	budgetUsd: number;
	steps: StepView[];
	findings: FindingView_Serialize[];
	worktreeKept: string | null;
	log: RunLogEvent_Serialize[];
};
type Pull = Omit<PrRowView, "lane" | "runs">;

export type MockFactory = {
	/** The project that holds the runs: the first one that reads them. */
	owner: string | null;
	/** Oldest first. The list gives the newest first. */
	runs: Rec[];
	pulls: Pull[];
	questions: { run: string; q: AskedQuestion_Serialize }[];
	/** The number of a message is its place among the messages of its run. */
	messages: { run: string; from: string; text: string; at: number; read: boolean }[];
	approvals: ApprovalView[];
	tiers: RunnerTiers[];
	kill: boolean;
	/** The text of each workflow file. */
	workflows: Record<string, string>;
	/** The role files that a person wrote. A default role has no file until then. */
	roles: Record<string, string>;
	/** The last id of the run log. Ids grow over all runs. */
	event: number;
};

const TIER_RUNNERS = ["claude", "codex", "copilot", "gemini", "opencode"];
const defaultTiers = (): RunnerTiers[] =>
	TIER_RUNNERS.map((runner) =>
		runner === "claude"
			? { runner, top: "opus", mid: "sonnet", small: "haiku" }
			: { runner, top: "", mid: "", small: "" },
	);

/** No run, no approval, no question, no message: the default files, tiers and a kill switch off. */
export const emptyFactory = (): MockFactory => ({
	owner: null,
	runs: [],
	pulls: [],
	questions: [],
	messages: [],
	approvals: [],
	tiers: defaultTiers(),
	kill: false,
	workflows: { ...WORKFLOWS },
	roles: {},
	event: 0,
});

// ------------------------------------------------------------------ ids and views

const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const enc = (n: number, len: number) => {
	let s = "";
	for (let i = 0; i < len; i++, n = Math.floor(n / 32)) s = B32.charAt(n % 32) + s;
	return s;
};
/** A ULID: 48 bits of milliseconds, then a counter. */
const ulid = (ms: number, seq: number) => enc(ms, 10) + enc(seq, 16);
const RUN_ID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const ready = (p: Pick<Pull, "ci" | "review" | "draft">) =>
	p.ci === "passing" && p.review === "clear" && !p.draft;

const laneOf = (state: RunState, pr: Pull | undefined): Lane =>
	state === "PROpen" ? (pr && ready(pr) ? "ready_to_merge" : "in_review") : LANE[state];

const prRow = (f: MockFactory, p: Pull): PrRowView => ({
	...p,
	lane: p.state === "open" ? (ready(p) ? "ready_to_merge" : "in_review") : "done",
	runs: f.runs.filter((r) => r.pr === p.number).map((r) => r.id),
});

function view(f: MockFactory, r: Rec): RunView_Serialize {
	const { log: _log, pr: prNumber, ...rest } = r;
	const pr = f.pulls.find((p) => p.number === prNumber);
	return {
		...rest,
		reference: `run:${r.id}`,
		lane: laneOf(r.state, pr),
		pr: pr ? prRow(f, pr) : null,
		openQuestions: f.questions.filter((x) => x.run === r.id && x.q.state === "open").length,
		approvals: f.approvals.filter((a) => a.run === r.id).length,
	};
}

/** The first project that reads the data set owns it. Without a project nothing is listed. */
function runsOf(f: MockFactory, project: string | null): Rec[] {
	if (!project) return [];
	if (f.owner === null) {
		f.owner = project;
		for (const r of f.runs) r.project = project;
	}
	return f.runs.filter((r) => r.project === project);
}

const find = (f: MockFactory, run: string) => {
	const r = f.runs.find((x) => x.id === run);
	if (!r) throw `no run ${run}`;
	return r;
};

// ------------------------------------------------------------------ run log

type Ev = [step: string | null, kind: string, payload: object];

function push(
	f: MockFactory,
	r: Rec,
	step: string | null,
	kind: string,
	payload: object,
	ts = Date.now(),
) {
	r.log.push({ id: ++f.event, step, kind, payload: JSON.stringify(payload), ts });
}

/** A change of state, with the rules of `transition`: the log, and no delivery write on a final run. */
function move(f: MockFactory, r: Rec, to: RunState, returnTo: RunState | null = null) {
	push(f, r, null, "state", { from: r.state, to, return_to: returnTo });
	r.state = to;
	r.returnTo = returnTo;
	if (FINAL.includes(to))
		f.approvals = f.approvals.filter((a) => !(a.run === r.id && DELIVERY.includes(a.kind)));
}

/** The step that a run works on, or the last one. */
const stepOf = (r: Rec) => (r.steps.find((s) => s.state !== "done") ?? r.steps.at(-1))?.id ?? null;

/** The states that a run went through, to write a plausible log. */
function trail(r: Rec): RunState[] {
	const base: RunState[] = ["Queued", "Claimed", "Planning"];
	const at = base.indexOf(r.state);
	if (at >= 0) return base.slice(0, at + 1);
	if (r.state === "PlanReview") return [...base, "PlanReview"];
	const out: RunState[] = [...base, "Working"];
	if (r.pr !== null) out.push("PROpen");
	if (r.state === "Done" && r.pr !== null) out.push("Merged");
	return out.at(-1) === r.state ? out : [...out, r.state];
}

function seedLog(f: MockFactory, r: Rec, t0: number) {
	const step = stepOf(r);
	const q = f.questions.find((x) => x.run === r.id);
	const extra: Partial<Record<RunState, Ev[]>> = {
		Planning: [
			[step, "runner", { event: "started", runner: "claude", model: "opus" }],
			[step, "tool", { name: "read_ticket", key: r.key }],
		],
		PlanReview: [[step, "note", { gate: "the plan waits for a person" }]],
		Working: [
			[step, "runner", { event: "started", runner: "claude", model: "sonnet" }],
			[step, "tool", { name: "read_ref", ref: `wi:${r.key}` }],
			[step, "write", { path: "src/lib/index.ts", added: 18, removed: 4 }],
			[step, "note", { text: "Test first, then the change." }],
		],
		PROpen: [["pr", "pr", { event: "opened", number: r.pr }]],
		ChangesRequested: [["review", "review", { round: 1, blocking: r.findings.length }]],
		WaitingForAnswer: [[step, "question", { ref: `q:${q?.q.id}`, outcome: "asked" }]],
		Blocked: [[step, "note", { blocked: "The French catalog is locked by another branch." }]],
		Paused: [[null, "note", { paused: `budget spent: $${r.costUsd} of $${r.budgetUsd}` }]],
		Failed: [[step, "runner", { event: "failed", error: "the check `pnpm test` failed 3 times" }]],
		Cancelled: [[null, "note", { stop: "click" }]],
		Merged: [["pr", "pr", { event: "merged", number: r.pr }]],
		Done: [[null, "note", { closed: "the ticket moved to Done" }]],
	};
	let prev: RunState | null = null;
	let n = 0;
	for (const s of trail(r)) {
		push(f, r, null, "state", { from: prev, to: s }, t0 + 40_000 * n++);
		for (const [st, kind, payload] of extra[s] ?? [])
			push(f, r, st, kind, payload, t0 + 40_000 * n++);
		prev = s;
	}
}

// ------------------------------------------------------------------ seed

const stepIds = (wf: string) =>
	parseWorkflow(wf, WORKFLOWS[wf] ?? "", DEFAULT_ROLES).workflow?.steps.map((s) => s.id) ?? [];

/** The steps of a workflow: those before `at` are done, `at` has `cur` and the units, the rest wait. */
const steps = (wf: string, at: number, cur: StepState = "running", units: UnitView[] = []) =>
	stepIds(wf).map(
		(id, i): StepView => ({
			id,
			state: i < at ? "done" : i === at ? cur : "pending",
			units: i === at ? units : [],
		}),
	);

const T0 = Date.UTC(2026, 9, 29, 6, 0, 0);
const DONE = 99;
const unit = (id: string, state: StepState): UnitView => ({ id, state });

export function seedFactory(): MockFactory {
	const f = emptyFactory();
	const run = (n: number, key: string, workflow: string, state: RunState, o: Partial<Rec>): Rec => {
		const ticket = FAKE_TICKETS.find((t) => t.key === key);
		const r: Rec = {
			id: ulid(T0 + n * 1_200_000, n),
			project: "",
			key,
			title: ticket?.title ?? key,
			url: ticket?.url ?? "",
			workflow,
			state,
			returnTo: null,
			pr: null,
			costUsd: 0,
			tokens: 0,
			turns: 0,
			budgetUsd:
				parseWorkflow(workflow, WORKFLOWS[workflow] ?? "", DEFAULT_ROLES).workflow?.limits
					.budget_usd ?? 0,
			steps: steps(workflow, DONE),
			findings: [],
			worktreeKept: null,
			log: [],
			...o,
		};
		f.runs.push(r);
		return r;
	};
	const kept = (r: Rec) => {
		r.worktreeKept = `/mock/demo/.shipyard/worktrees/${r.id}`;
	};
	const pull = (number: number, title: string, o: Partial<Pull> = {}) =>
		f.pulls.push({
			reference: `pr:github:${number}`,
			forge: "github",
			number,
			title,
			state: "open",
			draft: false,
			ci: "passing",
			review: "clear",
			headSha: (0x3a7c91e + number * 0x1f3b).toString(16).padStart(7, "0"),
			url: `https://github.com/acme/app/pull/${number}`,
			updated: `2026-10-${String(20 + (number % 9)).padStart(2, "0")}T14:30:00Z`,
			...o,
		});
	const ask = (r: Rec, q: Partial<AskedQuestion_Serialize> & { id: string; question: string }) =>
		f.questions.push({
			run: r.id,
			q: {
				options: [],
				recommended: 1,
				free_text: false,
				spec: null,
				state: "open",
				answer: null,
				unclear: null,
				edited: false,
				...q,
			},
		});
	const approval = (r: Rec, kind: string, summary: string, detail: string, force = false): void => {
		f.approvals.push({
			id: f.approvals.length + 1,
			run: r.id,
			key: r.key,
			title: r.title,
			kind,
			summary,
			detail,
			force,
		});
	};
	const message = (r: Rec, from: string, text: string, read: boolean) =>
		f.messages.push({
			run: r.id,
			from,
			text,
			at: Math.floor(T0 / 1000) + f.messages.length * 600,
			read,
		});

	pull(40, "Ship 0.1.0", { state: "merged", updated: "2026-10-26T15:02:00Z" });
	pull(42, "Rename the Work tab");
	pull(43, "Audit the keychain use", { ci: "failing" });
	pull(44, "Rework the settings page", { review: "changes_requested" });
	pull(45, "Add the health dot", { review: "changes_requested" });
	// Two pull requests that no run owns: a draft, and a closed one.
	pull(46, "Update the CI cache key", { draft: true });
	pull(47, "Try a new logo", { state: "closed", ci: "none" });

	// Done: a failed first try and the merged second one; a cancelled first try and a plain Done.
	const failed = run(1, "ACME-11", "feature", "Failed", {
		costUsd: 2.12,
		tokens: 150_300,
		turns: 20,
		steps: steps("feature", 2, "failed", [unit("t1", "done"), unit("t2", "failed")]),
	});
	kept(failed);
	run(2, "ACME-12", "spike", "Cancelled", {
		costUsd: 0.15,
		tokens: 12_000,
		turns: 3,
		steps: steps("spike", 1, "pending"),
	});
	run(3, "ACME-11", "feature", "Done", { pr: 40, costUsd: 4.08, tokens: 301_700, turns: 33 });
	run(4, "ACME-12", "spike", "Done", { costUsd: 0.74, tokens: 52_400, turns: 10 });
	// In review and ready to merge.
	run(5, "ACME-8", "bug", "PROpen", { pr: 42, costUsd: 0.88, tokens: 70_200, turns: 11 });
	run(6, "ACME-7", "bug", "PROpen", { pr: 43, costUsd: 1.12, tokens: 96_400, turns: 14 });
	const review = run(7, "ACME-5", "feature", "PROpen", {
		pr: 44,
		costUsd: 3.41,
		tokens: 241_000,
		turns: 28,
	});
	message(review, "review", "The review passed with no blocking finding.", true);
	// Needs you.
	const paused = run(8, "ACME-6", "bug", "Paused", {
		returnTo: "Working",
		costUsd: 3.04,
		tokens: 188_300,
		turns: 22,
		steps: steps("bug", 1),
	});
	ask(paused, {
		id: "Q-099",
		question: "Cache the project list in memory or on disk?",
		options: ["In memory", "On disk (SQLite)"],
		state: "answered",
		answer: { choice: { kind: "option", n: 1 }, source: { kind: "inbox" }, text: "" },
	});
	const blocked = run(9, "ACME-9", "bug", "Blocked", {
		returnTo: "Working",
		costUsd: 1.47,
		tokens: 112_800,
		turns: 19,
		steps: steps("bug", 1),
	});
	kept(blocked);
	message(blocked, "fix", "Blocked: the French catalog is locked by another branch.", false);
	const plan = run(10, "ACME-4", "feature", "PlanReview", {
		costUsd: 0.95,
		tokens: 58_100,
		turns: 9,
		steps: steps("feature", 1, "gate"),
	});
	ask(plan, {
		id: "Q-102",
		question: "Which export formats must the plan cover?",
		options: ["CSV only", "CSV and JSON"],
		recommended: 2,
		free_text: true,
		state: "answered",
		answer: {
			choice: { kind: "text", text: "CSV, JSON and Excel" },
			source: { kind: "inbox" },
			text: "",
		},
	});
	const waiting = run(11, "ACME-1", "bug", "WaitingForAnswer", {
		returnTo: "Working",
		costUsd: 0.62,
		tokens: 41_200,
		turns: 7,
		steps: steps("bug", 1),
	});
	ask(waiting, {
		id: "Q-101",
		question: "Where should the user land after the session expires?",
		options: [
			"The login page, then back to the page that they left",
			"The home page",
			"The login page, then the home page",
		],
		recommended: 1,
	});
	approval(
		waiting,
		"comment",
		"Comment on ACME-1: the question",
		"Where should the user land after the session expires?\n1. The login page, then back to the page that they left (recommended)\n2. The home page\n3. The login page, then the home page",
	);
	// Working.
	const building = run(12, "ACME-2", "feature", "Working", {
		costUsd: 1.84,
		tokens: 126_400,
		turns: 17,
		steps: steps("feature", 2, "running", [
			unit("t1", "done"),
			unit("t2", "running"),
			unit("t3", "running"),
			unit("t4", "pending"),
		]),
	});
	message(
		building,
		"build.t2",
		"The export needs the v2 schema. I used the v1 shape for now.",
		false,
	);
	approval(building, "transition", "Move ACME-2 to In Progress", "");
	approval(
		building,
		"open_pr",
		"Open a pull request for ACME-2",
		"## Add export endpoint\n\nAdds `GET /export`, with a CSV and a JSON body.\n\nChecks: `pnpm test` passed.",
	);
	const changes = run(13, "ACME-10", "feature", "ChangesRequested", {
		pr: 45,
		costUsd: 2.76,
		tokens: 205_500,
		turns: 25,
		steps: steps("feature", 3),
		findings: [
			{
				severity: "P1",
				path: "src/lib/health/dot.ts",
				line: 42,
				text: "The dot stays red after a recovery: the status never resets.",
			},
		],
	});
	approval(
		changes,
		"push",
		"Force push fix/ACME-10 with lease",
		"git push --force-with-lease origin fix/ACME-10",
		true,
	);
	// Queued.
	run(14, "ACME-3", "bug", "Queued", { steps: steps("bug", 0, "pending") });

	for (const [i, r] of f.runs.entries()) seedLog(f, r, T0 + i * 1_200_000);
	return f;
}

// ------------------------------------------------------------------ commands

export const tiersGet = (f: MockFactory) => f.tiers;

export function tiersSet(f: MockFactory, row: RunnerTiers): RunnerTiers[] {
	if (!TIER_RUNNERS.includes(row.runner)) throw `unknown runner: ${row.runner}`;
	const model = (text: string) => {
		const id = text.trim();
		if (id.length > 100 || id.startsWith("-") || !/^[A-Za-z0-9._:/@+-]*$/.test(id))
			throw `\`${id}\` is not a model id: use letters, digits and . _ - : / @ +`;
		return id;
	};
	const next = {
		runner: row.runner,
		top: model(row.top),
		mid: model(row.mid),
		small: model(row.small),
	};
	f.tiers = f.tiers.map((t) => (t.runner === row.runner ? next : t));
	return f.tiers;
}

/** The runs of the active project, newest first, each in its lane. */
export const runsList = (f: MockFactory, project: string | null): RunView_Serialize[] =>
	runsOf(f, project)
		.map((r) => view(f, r))
		.reverse();

export const runGetOne = (f: MockFactory, project: string | null, run: string) =>
	runsList(f, project).find((r) => r.id === run) ?? null;

/** A page of the run log, oldest first, after the event `after` (`0`: from the start). */
export function runLogPage(
	f: MockFactory,
	run: string,
	after: number,
	limit: number,
): RunLogPage_Serialize {
	if (!RUN_ID.test(run)) throw `\`${run}\` is not a run id`;
	const size = Math.min(Math.max(limit, 1), MAX_PAGE);
	const rest = (f.runs.find((r) => r.id === run)?.log ?? []).filter((e) => e.id > after);
	const events = rest.slice(0, size);
	return { events, last: events.at(-1)?.id ?? after, more: rest.length > size };
}

export function runStart(
	f: MockFactory,
	project: string,
	mirror: WorkItemView_Serialize[],
	key: string,
): string {
	const ticket = mirror.find((t) => t.key === key);
	if (!ticket) throw `${key} is not in the mirror: sync first`;
	if (runsOf(f, project).some((r) => r.key === key && !FINAL.includes(r.state)))
		throw `a run is active on ${key}`;
	const workflow = ticket.labels.includes("bug") ? "bug" : "feature";
	const r: Rec = {
		id: ulid(Date.now(), f.runs.length),
		project,
		key,
		title: ticket.title,
		url: ticket.url,
		workflow,
		state: "Queued",
		returnTo: null,
		pr: null,
		costUsd: 0,
		tokens: 0,
		turns: 0,
		budgetUsd:
			parseWorkflow(workflow, WORKFLOWS[workflow] ?? "", DEFAULT_ROLES).workflow?.limits
				.budget_usd ?? 0,
		steps: steps(workflow, 0, "pending"),
		findings: [],
		worktreeKept: null,
		log: [],
	};
	f.runs.push(r);
	push(f, r, null, "state", { from: null, to: "Queued" });
	return r.id;
}

/** A merged run is never cancelled. A final run stays as it is. Open questions are withdrawn. */
function cancel(f: MockFactory, r: Rec, reason: string) {
	if (r.state === "Merged") throw "a merged run goes to Done, not Cancelled";
	if (FINAL.includes(r.state)) return;
	for (const x of f.questions) if (x.run === r.id && x.q.state === "open") x.q.state = "withdrawn";
	push(f, r, null, "note", { stop: reason });
	move(f, r, "Cancelled");
}

export function runCancel(f: MockFactory, run: string): null {
	cancel(f, find(f, run), "click");
	return null;
}

const refuse = (event: string, r: Rec) => {
	throw `refused ${event} in ${r.state}`;
};

export function runUnblock(f: MockFactory, run: string): null {
	const r = find(f, run);
	if (r.state !== "Blocked") refuse("Unblock", r);
	move(f, r, r.returnTo ?? "Working");
	return null;
}

/** Raise the budget and resume a paused run. It stays paused while the budget is spent. */
export function runResume(
	f: MockFactory,
	run: string,
	addUsd: number | null,
	_addTokens: number,
): RunState {
	if (addUsd === null || !(addUsd >= 0 && Number.isFinite(addUsd)))
		throw "the added budget must be a positive number";
	const r = find(f, run);
	r.budgetUsd += addUsd;
	if (r.state !== "Paused") refuse("Resume", r);
	if (r.costUsd < r.budgetUsd) move(f, r, r.returnTo ?? "Working");
	return r.state;
}

const gate = (r: Rec, to: StepState) => {
	for (const s of r.steps) if (s.state === "gate") s.state = to;
};

export function runPlanApprove(f: MockFactory, run: string): null {
	const r = find(f, run);
	if (r.state !== "PlanReview") refuse("PlanApproved", r);
	move(f, r, "Working");
	gate(r, "done");
	return null;
}

/** The gate step runs again with the note. */
export function runPlanReject(f: MockFactory, run: string, note: string): null {
	const r = find(f, run);
	if (r.state !== "PlanReview") refuse("PlanRejected", r);
	move(f, r, "Planning");
	gate(r, "pending");
	if (note) push(f, r, null, "note", { rejected: note });
	return null;
}

export const killSwitchGet = (f: MockFactory) => f.kill;

/** On cancels every run that is not final. */
export function killSwitchSet(f: MockFactory, on: boolean): boolean {
	f.kill = on;
	if (on)
		for (const r of f.runs)
			if (r.state !== "Merged" && !FINAL.includes(r.state)) cancel(f, r, "kill switch");
	return on;
}

export function questionsList(f: MockFactory, project: string | null): QuestionView_Serialize[] {
	const runs = runsOf(f, project);
	return f.questions
		.flatMap(({ run, q }) => {
			const r = runs.find((x) => x.id === run);
			return r ? [{ run, key: r.key, title: r.title, question: q }] : [];
		})
		.sort((a, b) => Number(b.question.state === "open") - Number(a.question.state === "open"));
}

/** An answer in the Inbox. The run goes on when no question of it is open. */
export function questionAnswer(
	f: MockFactory,
	run: string,
	id: string,
	choice: QuestionChoice,
): null {
	const r = find(f, run);
	const item = f.questions.find((x) => x.run === run && x.q.id === id);
	if (!item) throw `no question ${id} in run ${run}`;
	const q = item.q;
	// The first answer wins: a later one is a late answer or a closed question, and no error (REQ-013).
	if (q.state !== "open") return null;
	const valid =
		choice.kind === "option"
			? Number.isInteger(choice.n) && choice.n >= 1 && choice.n <= q.options.length
			: q.free_text && choice.text.trim() !== "";
	if (!valid) throw "the choice is not an option of the question";
	q.state = "answered";
	q.answer = { choice, source: { kind: "inbox" }, text: "" };
	push(f, r, null, "question", { ref: `q:${q.id}`, outcome: "answered", answer: q.answer });
	if (
		r.state === "WaitingForAnswer" &&
		!f.questions.some((x) => x.run === run && x.q.state === "open")
	)
		move(f, r, r.returnTo ?? "Working");
	return null;
}

export function messagesList(f: MockFactory, project: string | null): MessageView[] {
	const runs = runsOf(f, project);
	const count: Record<string, number> = {};
	return f.messages.flatMap((m) => {
		const n = (count[m.run] ?? -1) + 1;
		count[m.run] = n;
		const r = runs.find((x) => x.id === m.run);
		return r
			? [
					{
						run: m.run,
						n,
						key: r.key,
						title: r.title,
						from: m.from,
						text: m.text,
						at: m.at,
						read: m.read,
					},
				]
			: [];
	});
}

export function messageReadMark(f: MockFactory, run: string, n: number): null {
	const r = find(f, run);
	const m = f.messages.filter((x) => x.run === run)[n];
	if (!m) throw `run ${run} has no message ${n}`;
	m.read = true;
	push(f, r, null, "message", { read: n });
	return null;
}

export function approvalsList(f: MockFactory, project: string | null): ApprovalView[] {
	const runs = runsOf(f, project);
	return f.approvals.flatMap((a) => {
		const r = runs.find((x) => x.id === a.run);
		return r ? [{ ...a, key: r.key, title: r.title }] : [];
	});
}

const waiting = (f: MockFactory, id: number) => {
	const a = f.approvals.find((x) => x.id === id);
	if (!a) throw `no approval ${id} waits`;
	return a;
};

/** A click: send the write. Returns what it made (a comment id, a pull request number). */
export function approvalApprove(f: MockFactory, id: number): string | null {
	const a = waiting(f, id);
	if (f.kill) throw "the kill switch is on: no write goes out";
	const state = f.runs.find((r) => r.id === a.run)?.state;
	if (state && DELIVERY.includes(a.kind)) {
		if (FINAL.includes(state)) {
			f.approvals = f.approvals.filter((x) => !(x.run === a.run && DELIVERY.includes(x.kind)));
			throw `the run is ${state}: the write is dropped`;
		}
		if (SIDE.includes(state)) throw `the run is ${state}: approve the write when it goes on`;
	}
	f.approvals = f.approvals.filter((x) => x.id !== id);
	return a.kind === "comment" ? `comment-${id}` : a.kind === "open_pr" ? "48" : null;
}

/** The write is dropped and the run blocks. */
export function approvalReject(f: MockFactory, id: number): null {
	const a = waiting(f, id);
	f.approvals = f.approvals.filter((x) => x.id !== id);
	const r = f.runs.find((x) => x.id === a.run);
	if (r && !FINAL.includes(r.state) && !SIDE.includes(r.state) && r.state !== "Merged")
		move(f, r, "Blocked", r.state);
	return null;
}

export function pullsList(f: MockFactory, project: string | null): PrRowView[] {
	if (!project) return [];
	runsOf(f, project);
	return f.owner === project ? f.pulls.map((p) => prRow(f, p)) : [];
}

// ------------------------------------------------------------------ workflows and roles

const roleNames = (f: MockFactory) => [
	...DEFAULT_ROLES,
	...Object.keys(f.roles)
		.filter((id) => !DEFAULT_ROLES.includes(id))
		.sort(),
];

const checkWorkflow = (f: MockFactory, id: string, text: string) =>
	parseWorkflow(id, text, roleNames(f));

export const workflowsList = (f: MockFactory): WorkflowItem_Serialize[] =>
	Object.entries(f.workflows)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([id, text]) => {
			const { workflow, issue } = checkWorkflow(f, id, text);
			return { id, steps: workflow?.steps.map((s) => s.id) ?? [], issue };
		});

export function workflowGet(f: MockFactory, id: string): WorkflowFile_Serialize {
	const text = f.workflows[fileId(id)];
	if (text === undefined) throw `no workflow \`${id}\``;
	return { id, text, ...checkWorkflow(f, id, text) };
}

/** The first issue of a text, or `null`. Nothing is written. */
export function workflowCheck(f: MockFactory, id: string, text: string) {
	tooBig(text);
	return checkWorkflow(f, fileId(id), text).issue;
}

/** An invalid text is refused: the file never holds one. */
export function workflowWrite(f: MockFactory, id: string, text: string): null {
	const i = workflowCheck(f, id, text);
	if (i) throw refusal(i);
	f.workflows[id] = text;
	return null;
}

export const rolesList = (f: MockFactory): RoleItem_Serialize[] =>
	roleNames(f).map((id) => {
		const { role } = parseRole(id, roleFile(f, id).text);
		return {
			id,
			description: role?.description ?? "",
			model: role?.model ?? null,
			effort: role?.effort ?? null,
			file: id in f.roles,
			bundled: DEFAULT_ROLES.includes(id),
		};
	});

function roleFile(f: MockFactory, id: string): RoleFile_Serialize {
	const bundled = ROLES.find(([x]) => x === id);
	const text = f.roles[id] ?? (bundled ? roleText(bundled) : undefined);
	if (text === undefined) throw `no role \`${id}\``;
	return { id, text, ...parseRole(id, text) };
}

export const roleGet = (f: MockFactory, id: string) => roleFile(f, fileId(id));

export function roleWrite(f: MockFactory, id: string, text: string): null {
	fileId(id);
	tooBig(text);
	const { issue } = parseRole(id, text);
	if (issue) throw refusal(issue);
	f.roles[id] = text;
	return null;
}
