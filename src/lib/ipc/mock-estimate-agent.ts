// The mock of "Ask an agent to estimate" (`crates/shipyard-app/src/estimate_agent.rs`). It gives a
// proposal for each asked task, refuses a sealed or frozen sheet, and never writes the sheet.
import type { EstimateProposal, SessionView_Serialize } from "./bindings";
import type { MockWork } from "./mock-work";

export const STOPPED = "the estimate was stopped";

export type MockEstimateAgent = {
	/** The next estimate runs until its stop. The mock ends an estimate at once: a test sets this. */
	hold: boolean;
	/** The sheets that an agent estimates now, each with the function that stops its turn. */
	running: Record<string, () => void>;
};

export const seedEstimateAgent = (): MockEstimateAgent => ({ hold: false, running: {} });

/** The running estimates as sessions of Crew / Sessions. `key` is the sheet. */
export function estimateSessions(a: MockEstimateAgent): SessionView_Serialize[] {
	return Object.keys(a.running).map((slug) => ({
		run: `estimate-${slug}`,
		key: slug,
		step: "estimate",
		runner: "claude",
		model: "opus",
		state: "running",
		tokens: 0,
		costUsd: 0,
		started: 0,
		pull: null,
	}));
}

/** Stops the running estimate of a sheet. Nothing runs: nothing happens. */
export function estimateStop(a: MockEstimateAgent, slug: string): null {
	a.running[slug]?.();
	return null;
}

const quarter = (n: number) => Math.round(n * 4) / 4;

export function estimateStart(
	a: MockEstimateAgent,
	w: MockWork,
	slug: string,
	taskIds: string[],
	click: boolean,
	off: { readOnly: boolean; stopped: boolean },
): EstimateProposal[] | Promise<EstimateProposal[]> {
	if (!click) throw "this change needs the click of a person";
	if (off.readOnly) throw "the profile of this project is read only";
	if (taskIds.length === 0) throw "no task is selected";
	if (w.sealed !== null) throw "the sheet is sealed: an agent cannot estimate it";
	const sheet = w.sheets[slug];
	if (!sheet) throw `no sheet ${slug}`;
	if (sheet.frozen) throw "the sheet is frozen: unfreeze it first";
	if (off.stopped) throw "the agents are stopped: switch them on first";
	if (a.running[slug]) throw "an estimate of this sheet is running";
	const tasks = sheet.features.flatMap((f) => f.tasks);
	const proposals = taskIds.flatMap((id): EstimateProposal[] => {
		const task = tasks.find((t) => t.id === id);
		if (!task) return [];
		const likely = quarter((task.days ?? 2) + 1);
		return [
			{
				task: id,
				best: quarter(likely * 0.5),
				likely,
				worst: quarter(likely * 2),
				assumptions: [`${task.name} needs no new service.`],
			},
		];
	});
	if (!a.hold) return proposals;
	a.hold = false;
	return new Promise((_, reject) => {
		a.running[slug] = () => {
			delete a.running[slug];
			reject(STOPPED);
		};
	});
}
