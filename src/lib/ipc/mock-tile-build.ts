// The mock of "Build a tile for me" (`crates/shipyard-app/src/pr_agent/tile.rs`). A build is one
// slow turn: it holds a slot of the agent reviews, so it is a session row that the stop of a
// session ends. It writes nothing. Words that hold "spent" stand for a spent shared budget.
import type { SessionView_Serialize, TileProposal } from "./bindings";
import type { MockAgentPr } from "./mock-agent-pr";

/** How long a build takes, and how often it looks for a stop, in ms. */
export const BUILD_MS = 800;
const TICK_MS = 40;
/** What the mock turn costs, in USD. */
const COST = 0.1;

/** The first kind whose pattern the words hold. No match: the work items. */
const KINDS: [RegExp, string][] = [
	[/assignee|person|who/i, "tracker-assignee"],
	[/status/i, "tracker-status"],
	[/open|issue|ticket/i, "tracker-open"],
	[/run|agent/i, "runs"],
	[/question/i, "questions"],
	[/spec/i, "specs"],
	[/estimate|day/i, "estimates"],
	[/quality|gate|test/i, "quality"],
	[/impact/i, "impact"],
];

/** The running builds: the session number and its dashboard. */
const building = new Map<number, string>();
let next = 4_000_000_000;

/** The session rows, with the row of a build named by its dashboard and the step `tile`. */
export function sessions(rows: SessionView_Serialize[]): SessionView_Serialize[] {
	return rows.map((r) => {
		const slug = r.pull == null ? undefined : building.get(r.pull);
		return slug === undefined ? r : { ...r, run: `tile${r.pull}`, key: slug, step: "tile" };
	});
}

export async function tileBuild(
	a: MockAgentPr,
	readOnly: boolean,
	slug: string,
	text: string,
	budgetUsd: number | null,
): Promise<TileProposal> {
	const words = text.trim();
	if (!words) throw "say what the tile must show";
	if (words.length > 500) throw "the text of the tile is longer than 500 characters";
	if (!(budgetUsd !== null && budgetUsd > 0))
		throw "the budget of the tile must be a positive number";
	if (readOnly) throw `the dashboard ${slug} is read only`;
	if (a.stopped) throw "the agents are stopped: switch them on first";
	if (/spent/i.test(words))
		throw "the budget day 2026-10-29 is spent: the review waits for the next budget";
	const number = next++;
	building.set(number, slug);
	a.running.push(number);
	try {
		for (let t = 0; t < BUILD_MS; t += TICK_MS) {
			await new Promise((r) => setTimeout(r, TICK_MS));
			// The stop of a session, or the switch "Agents stopped", took the slot away.
			if (a.stopped || !a.running.includes(number)) throw "the tile build was stopped";
		}
	} finally {
		building.delete(number);
		a.running = a.running.filter((n) => n !== number);
	}
	if (budgetUsd < COST)
		throw `the budget of $${budgetUsd.toFixed(2)} is spent: the tile waits for a larger budget`;
	const kind = KINDS.find(([re]) => re.test(words))?.[1] ?? "work";
	return { kind, title: words.slice(0, 60), w: 4, h: 3 };
}
