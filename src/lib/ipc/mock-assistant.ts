// The mock of the assistant commands. It applies the rules of `crates/shipyard-app/src/assistant.rs`:
// a ref joins the context only when it resolves, a runner change drops the model and the effort,
// a runner failure is a message with a state and not an error, a spent budget is an error, and
// Send to factory is idempotent. The text of a turn picks a scenario (the real runner decides in the app):
//   "quota" or "fail"  the turn fails (quota, error); Retry then succeeds
//   "spent"            the budget is spent: the command fails
//   "alert"            the turn runs and the budget is at 80 %
//   "options"          the reply asks a question and lists options
//   "code"             the reply holds a code block
//   "long"             the thread uses 60 % of the context window
//   "deny"             agent mode only: a tool is denied and the turn waits; Grant resumes it
//   "refuse"           Send to factory fails: the tracker refuses the item (an error, not a send)
import type {
	AssistantDefaults_Deserialize,
	AssistantDefaults_Serialize,
	ChatMessage,
	Context_Deserialize,
	Context_Serialize,
	DiffRow_Serialize,
	FactorySend_Serialize,
	FileDiff,
	Quote,
	RunnerOptions,
	Thread_Serialize,
	ThreadSettings_Deserialize,
	ThreadSettings_Serialize,
	ThreadSummary,
	ThreadView_Serialize,
	TraceStep,
	TurnResult_Serialize,
} from "./bindings";
import { parseRef } from "./mock-refs";

type Rec = {
	thread: Thread_Serialize;
	/** Tokens of the last model call. */
	used: number;
	/** The files that the worktree changed. */
	files: FileDiff[];
	/** The key of the work item that Send to factory made. */
	sent: string | null;
};

export type MockAssistant = {
	threads: Rec[];
	defaults: AssistantDefaults_Serialize;
	seq: number;
};

/** The active project and the test of the ref index. */
export type Env = { project: string; resolves: (ref: string) => boolean };

export const seedAssistant = (): MockAssistant => ({
	threads: [],
	defaults: { runner: null, model: null, effort: null, mode: null, permission: null },
	seq: 0,
});

const OPTIONS: RunnerOptions[] = [
	{
		runner: "claude",
		models: ["opus", "sonnet", "haiku"],
		efforts: ["low", "medium", "high", "xhigh", "max"],
		windowTokens: 200_000,
	},
	{
		runner: "codex",
		models: ["gpt-5", "gpt-5-codex"],
		efforts: ["minimal", "low", "medium", "high"],
		windowTokens: 400_000,
	},
];
const BUDGET = "day 2026-10-29";
const PERMISSION = "Bash(pnpm test)";

const now = () => Math.floor(Date.now() / 1000);
const zero = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: null };
const opts = (runner: string) => OPTIONS.find((o) => o.runner === runner);

function find(a: MockAssistant, env: Env, id: string): Rec {
	const r = a.threads.find((x) => x.thread.id === id && x.thread.project === env.project);
	if (!r) throw `no thread ${id}`;
	return r;
}

function view(r: Rec): ThreadView_Serialize {
	const o = opts(r.thread.settings.runner);
	return {
		thread: r.thread,
		gauge: {
			usedTokens: r.used,
			windowTokens: o?.windowTokens ?? 200_000,
			// No runner reports a quota yet. The mock reports one for Codex, to reach the windows.
			quotas: r.thread.settings.runner === "codex" ? [{ label: "5h", percent: 40 }] : [],
		},
	};
}

const summary = (r: Rec): ThreadSummary => ({
	id: r.thread.id,
	title: r.thread.title,
	mode: r.thread.settings.mode,
	runner: r.thread.settings.runner,
	updated: r.thread.updated,
});

export const threads = (a: MockAssistant, env: Env): ThreadSummary[] =>
	a.threads
		.filter((r) => r.thread.project === env.project)
		.sort((x, y) => y.thread.updated - x.thread.updated || y.thread.created - x.thread.created)
		.map(summary);

export function create(a: MockAssistant, env: Env, title: string | null): ThreadView_Serialize {
	const d = a.defaults;
	a.seq += 1;
	const at = now() + a.seq;
	const thread: Thread_Serialize = {
		id: `T${String(a.seq).padStart(4, "0")}`,
		project: env.project,
		title: title?.trim() ?? "",
		settings: {
			runner: d.runner ?? "claude",
			model: d.model,
			effort: d.effort,
			mode: d.mode ?? "ask",
			permission: d.permission ?? "approve",
		},
		context: { view: "", selected: null, refs: [] },
		draft: "",
		session: null,
		granted: [],
		messages: [],
		usage: zero,
		worktree: null,
		created: at,
		updated: at,
	};
	const r: Rec = { thread, used: 0, files: [], sent: null };
	a.threads.push(r);
	return view(r);
}

export const get = (a: MockAssistant, env: Env, id: string) => view(find(a, env, id));

export function rename(a: MockAssistant, env: Env, id: string, title: string): ThreadSummary {
	const r = find(a, env, id);
	r.thread.title = title.trim();
	return summary(r);
}

export function remove(a: MockAssistant, env: Env, id: string): null {
	const r = find(a, env, id);
	if (r.files.length) throw "The worktree of the thread has changes. Discard it first.";
	a.threads = a.threads.filter((x) => x !== r);
	return null;
}

export function worktreeDiscard(a: MockAssistant, env: Env, id: string, force: boolean) {
	const r = find(a, env, id);
	if (r.files.length && !force) throw "The worktree of the thread has changes.";
	r.files = [];
	r.thread.worktree = null;
	return view(r);
}

export const diff = (a: MockAssistant, env: Env, id: string): FileDiff[] => find(a, env, id).files;

export function saveDraft(
	a: MockAssistant,
	env: Env,
	id: string,
	draft: string,
	context: Context_Deserialize,
): null {
	const r = find(a, env, id);
	r.thread.draft = draft;
	r.thread.context = ctx(context);
	return null;
}

const ctx = (c: Context_Deserialize): Context_Serialize => ({
	view: c.view,
	selected: c.selected ?? null,
	refs: c.refs,
});

export function settingsSet(
	a: MockAssistant,
	env: Env,
	id: string,
	s: ThreadSettings_Deserialize,
): ThreadView_Serialize {
	const r = find(a, env, id);
	const o = opts(s.runner);
	if (!o) throw `unknown runner: ${s.runner}`;
	const same = s.runner === r.thread.settings.runner;
	const next: ThreadSettings_Serialize = {
		runner: s.runner,
		// A model or an effort belongs to its runner: a runner change drops them and the session.
		model: same ? (s.model ?? null) : null,
		effort: same ? (s.effort ?? null) : null,
		mode: s.mode,
		permission: s.permission ?? "approve",
	};
	if (next.model && !o.models.includes(next.model)) throw `unknown model: ${next.model}`;
	if (next.effort && !o.efforts.includes(next.effort)) throw `unknown effort: ${next.effort}`;
	if (!same) r.thread.session = null;
	r.thread.settings = next;
	return view(r);
}

export function refAdd(a: MockAssistant, env: Env, id: string, text: string): Context_Serialize {
	const r = find(a, env, id);
	const ref = text.trim().replace(/^@/, "");
	if (!parseRef(ref)) throw `${ref} is not a ref`;
	if (!env.resolves(ref)) throw `${ref} does not resolve`;
	if (!r.thread.context.refs.includes(ref)) r.thread.context.refs.push(ref);
	return r.thread.context;
}

export function refRemove(a: MockAssistant, env: Env, id: string, text: string): Context_Serialize {
	const r = find(a, env, id);
	r.thread.context.refs = r.thread.context.refs.filter((x) => x !== text);
	return r.thread.context;
}

// ------------------------------------------------------------------ turns

const step = (tool: string, target: string, ms: number): TraceStep => ({ tool, target, ms });

function answer(
	r: Rec,
	context: Context_Serialize,
	text: string,
): { text: string; refs: string[]; trace: TraceStep[] } {
	const mode = r.thread.settings.mode;
	const refs = [context.selected, ...context.refs].filter(
		(x, i, all): x is string => x !== null && all.indexOf(x) === i,
	);
	const trace = [step("Read", refs[0] ?? "docs/plan/MASTER-PLAN.md", 120), step("Grep", text, 80)];
	const cite = refs.length ? ` It follows ${refs.join(", ")}.` : "";
	if (/options/i.test(text))
		return {
			text: "Which path do you want?\n- Ship the change now\n- Split it in two steps",
			refs: [],
			trace: [...trace, step("Read", "docs/delivery/questions", 60)],
		};
	if (/code/i.test(text))
		return {
			text: "Use this helper.\n```ts src/hello.ts\nexport const hello = () => 'hello';\n```",
			refs: [],
			trace: [...trace, step("Read", "src/hello.ts", 40)],
		};
	if (mode === "plan")
		return {
			text: `Plan:\n1. Read the spec.\n2. Write the test.\n3. Make the change.${cite}`,
			refs,
			trace: [...trace, step("Read", "docs/openspec", 70)],
		};
	return {
		text: `Here is the answer.${cite}`,
		refs,
		trace: [...trace, step("Read", "docs/openspec", 70)],
	};
}

const hello: FileDiff = {
	path: "src/hello.ts",
	text: "--- a/src/hello.ts\n+++ b/src/hello.ts\n@@ -1 +1,2 @@\n-export const hello = () => 'hi';\n+export const hello = () => 'hello';\n+export const bye = () => 'bye';",
	binary: false,
	truncated: false,
};

function turn(r: Rec, message: ChatMessage, alert: string | null = null): TurnResult_Serialize {
	r.thread.messages.push(message);
	r.thread.updated = now();
	r.thread.usage = {
		...r.thread.usage,
		inputTokens: r.thread.usage.inputTokens + 1200,
		outputTokens: r.thread.usage.outputTokens + 300,
	};
	return { thread: view(r), message, changed: r.files, alert };
}

const reply = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
	role: "assistant",
	text,
	quotes: [],
	refs: [],
	trace: [],
	state: { state: "done" },
	usage: { inputTokens: 1200, outputTokens: 300, cachedTokens: 0, costUsd: null },
	at: now(),
	...extra,
});

/** The agent edit: the first agent turn makes the worktree of the thread. */
function edit(r: Rec) {
	r.thread.worktree ??= {
		path: `/mock/worktrees/${r.thread.id}`,
		branch: `assistant/${r.thread.id}`,
		base: "abc1234",
	};
	if (!r.files.length) r.files = [hello];
}

export function send(
	a: MockAssistant,
	env: Env,
	id: string,
	text: string,
	quotes: Quote[],
	context: Context_Deserialize,
): TurnResult_Serialize {
	const r = find(a, env, id);
	const last = r.thread.messages.at(-1);
	if (last?.role === "user") throw "The thread is busy.";
	if (/spent/i.test(text)) throw `The budget ${BUDGET} is spent`;
	const c = ctx(context);
	r.thread.context = c;
	r.thread.draft = "";
	if (!r.thread.title) r.thread.title = (text.trim().split("\n")[0] ?? "").slice(0, 60);
	r.thread.messages.push({
		role: "user",
		text,
		quotes,
		refs: [],
		trace: [],
		state: { state: "done" },
		usage: zero,
		at: now(),
	});
	const alert = /alert/i.test(text) ? BUDGET : null;
	r.used = /long/i.test(text)
		? (opts(r.thread.settings.runner)?.windowTokens ?? 0) * 0.6
		: r.used + 8000;
	if (/quota|fail/i.test(text)) {
		const quota = /quota/i.test(text);
		return turn(
			r,
			reply("", {
				state: {
					state: "failed",
					kind: quota ? "quota" : "error",
					message: quota ? "The quota of the runner is out." : "The runner stopped with an error.",
				},
			}),
			alert,
		);
	}
	const { mode } = r.thread.settings;
	if (mode === "agent") {
		if (/deny/i.test(text)) {
			edit(r);
			return turn(
				r,
				reply("", {
					state: { state: "waiting", permission: PERMISSION },
					trace: [step("Edit", "src/hello.ts", 90), step("Bash", "pnpm test", 10)],
				}),
				alert,
			);
		}
		edit(r);
		return turn(
			r,
			reply("I changed src/hello.ts in the worktree.", {
				trace: [step("Read", "src/hello.ts", 40), step("Edit", "src/hello.ts", 90)],
			}),
			alert,
		);
	}
	const out = answer(r, c, text);
	return turn(r, reply(out.text, { refs: out.refs.filter(env.resolves), trace: out.trace }), alert);
}

function resume(r: Rec, text: string, trace: TraceStep[]) {
	return turn(r, reply(text, { trace }));
}

export function grant(a: MockAssistant, env: Env, id: string): TurnResult_Serialize {
	const r = find(a, env, id);
	const state = r.thread.messages.at(-1)?.state;
	if (state?.state !== "waiting") throw "The last message does not wait for a permission.";
	if (r.thread.settings.mode !== "agent") throw "Only an agent turn waits for a permission.";
	r.thread.granted.push(state.permission);
	return resume(r, "I ran pnpm test. All tests pass.", [step("Bash", "pnpm test", 2100)]);
}

export function retry(a: MockAssistant, env: Env, id: string): TurnResult_Serialize {
	const r = find(a, env, id);
	if (r.thread.messages.at(-1)?.state.state !== "failed") throw "The last message did not fail.";
	return resume(r, "Here is the answer.", [step("Read", "docs/openspec", 70)]);
}

export function explain(
	a: MockAssistant,
	env: Env,
	id: string,
	entity: string,
): TurnResult_Serialize {
	const r = find(a, env, id);
	if (r.thread.settings.mode !== "ask") throw "Explain runs in ask mode.";
	r.thread.messages.push({
		role: "user",
		text: `Explain ${entity}`,
		quotes: [],
		refs: [],
		trace: [],
		state: { state: "done" },
		usage: zero,
		at: now(),
	});
	if (!env.resolves(entity)) return turn(r, reply(`No source for ${entity} in this project.`));
	return turn(
		r,
		reply(`${entity} is part of the project graph. It connects to the refs below.`, {
			refs: [entity],
			trace: [step("Read", entity, 60), step("Grep", entity, 45)],
		}),
	);
}

// ------------------------------------------------------------------ factory

export function toFactoryPreview(a: MockAssistant, env: Env, id: string): DiffRow_Serialize {
	const r = find(a, env, id);
	if (!r.thread.messages.length) throw "The thread is empty.";
	const last = [...r.thread.messages].reverse().find((m) => m.role === "assistant" && m.text);
	return {
		row: {
			reference: `doc:assistant/${id}`,
			kind: "story",
			title: r.thread.title,
			description: last?.text ?? "",
			days: null,
			parent: null,
		},
		action: r.sent ? "unchanged" : "create",
		key: r.sent,
		changes: [],
	};
}

export function toFactory(
	a: MockAssistant,
	env: Env,
	id: string,
	workflow: string | null,
	click: boolean,
): FactorySend_Serialize {
	if (!click) throw "Confirm the work item first.";
	const preview = toFactoryPreview(a, env, id);
	const r = find(a, env, id);
	if (r.thread.messages.some((m) => m.role === "user" && /refuse/i.test(m.text))) {
		throw "The tracker refused the item: 400.";
	}
	const action = r.sent ? "unchanged" : "create";
	r.sent ??= `SHIP-${100 + a.seq}`;
	return {
		item: { reference: preview.row.reference, action, key: r.sent, error: null, skipped: [] },
		label: workflow ? `wf:${workflow}` : null,
	};
}

// ------------------------------------------------------------------ defaults and options

export const defaultsGet = (a: MockAssistant) => a.defaults;

export function defaultsSet(
	a: MockAssistant,
	d: AssistantDefaults_Deserialize,
): AssistantDefaults_Serialize {
	if (d.runner && !opts(d.runner)) throw `unknown runner: ${d.runner}`;
	a.defaults = {
		runner: d.runner ?? null,
		model: d.model ?? null,
		effort: d.effort ?? null,
		mode: d.mode ?? null,
		permission: d.permission ?? null,
	};
	return a.defaults;
}

export const options = (): RunnerOptions[] => OPTIONS;
