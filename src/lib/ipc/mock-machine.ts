// The mock of the AI sessions of this computer and their spend. It applies the rules of the Rust
// commands: only a running session can stop, a budget is 0 or more, and a day is a UTC date.
import type {
	Budget,
	BudgetStatus,
	MachineLoad,
	MachineSession_Serialize,
	Spend,
	SpendRow,
	TakeOver,
} from "./bindings";

export type MockMachine = { sessions: MachineSession_Serialize[]; budgets: Budget[] };

const session = (
	pid: number | null,
	runner: string,
	model: string,
	project: string,
	state: string,
	tokens: number,
	costUsd: number,
	title: string,
): MachineSession_Serialize => ({
	key: pid === null ? `log:${runner}-${project}` : `pid:${pid}`,
	runner,
	model,
	project,
	cwd: `/mock/${project}`,
	title,
	state,
	tokens,
	costUsd,
	pid,
	// Claude Code and Codex write a history that resumes; the other tools do not.
	session: runner === "claude" || runner === "codex" ? `${runner}-${project}-1` : "",
});

export const seedMachine = (): MockMachine => ({
	sessions: [
		session(4101, "claude", "claude-opus-4", "alpha", "working", 1_250_000, 18.4, "Fix the login"),
		session(4188, "codex", "gpt-5", "beta", "idle", 420_000, 2.1, "Add the export"),
		session(null, "claude", "claude-sonnet-4", "gamma", "done", 90_000, 0.6, "Rename the module"),
	],
	budgets: [],
});

export function machineStop(m: MockMachine, pid: number): null {
	const s = m.sessions.find((x) => x.pid === pid);
	if (!s) throw `no AI session runs as process ${pid}`;
	m.sessions = m.sessions.filter((x) => x !== s);
	return null;
}

const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

const COMBOS = [
	["claude", "claude-opus-4", "alpha"],
	["claude", "claude-sonnet-4", "beta"],
	["codex", "gpt-5", "beta"],
] as const;

export function machineSpend(m: MockMachine, days: number): Spend {
	const rows: SpendRow[] = [];
	for (let back = 0; back < Math.min(Math.max(days, 1), 365); back++)
		COMBOS.forEach(([runner, model, project], i) => {
			if ((back + i) % 4 === 3) return;
			const tokens = 200_000 + ((back * 37 + i * 91) % 9) * 150_000;
			rows.push({
				day: day(back),
				runner,
				model,
				project,
				tokens,
				costUsd: Math.round(tokens * (i === 0 ? 0.000012 : 0.000004) * 100) / 100,
			});
		});
	return { rows, budgets: m.budgets };
}

export function machineBudgetSet(m: MockMachine, runner: string, usd: number | null): Budget[] {
	if (usd !== null && (!Number.isFinite(usd) || usd < 0)) throw "the budget must be 0 or more";
	m.budgets = m.budgets.filter((b) => b.runner !== runner);
	if (usd !== null) m.budgets.push({ runner, usd });
	m.budgets.sort((a, b) => a.runner.localeCompare(b.runner));
	return m.budgets;
}

/** The Warn at level of a budget when the project sets none (`crates/shipyard-app/src/shell/budget.rs`). */
export const DEFAULT_WARN_PERCENT = 80;

/** The budgets that reached Warn at this month: the notice of Setup / Me. */
export function budgetStatus(m: MockMachine, warnPercent = DEFAULT_WARN_PERCENT): BudgetStatus {
	const month = new Date().toISOString().slice(0, 7);
	const rows = machineSpend(m, 31).rows.filter((r) => r.day.startsWith(month));
	const reached = m.budgets
		.map((b) => ({ ...b, usd: b.usd ?? 0 }))
		.filter((b) => b.usd > 0)
		.flatMap((b) => {
			const spent = rows
				.filter((r) => !b.runner || r.runner === b.runner)
				.reduce((a, r) => a + (r.costUsd ?? 0), 0);
			return spent >= (b.usd * warnPercent) / 100
				? [
						{
							runner: b.runner,
							spentUsd: spent,
							budgetUsd: b.usd,
							percent: Math.floor((spent / b.usd) * 100),
						},
					]
				: [];
		});
	return { warnPercent, month, reached };
}

/** Take control: only a running session of a tool that resumes can be taken, and it stops. */
export function machineTake(m: MockMachine, pid: number, click: boolean): TakeOver {
	if (!click) throw "this change needs the click of a person";
	const s = m.sessions.find((x) => x.pid === pid);
	if (!s) throw `no AI session runs as process ${pid}`;
	const resume = { claude: "claude --resume", codex: "codex resume" }[s.runner];
	if (!resume || !s.session) throw `${s.runner} has no session to resume`;
	m.sessions = m.sessions.filter((x) => x !== s);
	return { cwd: s.cwd, command: `${resume} ${s.session}` };
}

/** The live output of a session: a tool with no history that Shipyard reads gives none. */
export function machineOutput(m: MockMachine, runner: string, session: string): string[] {
	if ((runner !== "claude" && runner !== "codex") || !session) return [];
	const s = m.sessions.find((x) => x.runner === runner && x.session === session);
	return [`> ${s?.title ?? "Add export endpoint"}`, "On it.", "[Read]", "The change is ready."];
}

/** The load of the agent processes only: two processes give the sum of the two. */
export function machineLoad(m: MockMachine): MachineLoad {
	const running = m.sessions.filter((s) => s.pid !== null).length;
	return {
		processes: running,
		cpuPercent: Math.min(100, running * 20),
		memoryBytes: running * 1.1e9,
		memoryTotal: 16e9,
	};
}
