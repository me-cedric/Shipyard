// The mock of the AI sessions of this computer and their spend. It applies the rules of the Rust
// commands: only a running session can stop, a budget is 0 or more, and a day is a UTC date.
import type { Budget, MachineSession_Serialize, Spend, SpendRow } from "./bindings";

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
