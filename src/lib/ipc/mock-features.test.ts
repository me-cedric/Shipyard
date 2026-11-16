import { describe, expect, it } from "vitest";
import { commands, type RunState } from "./bindings";
import { DEMO_FOLDER, resetMock } from "./mock";
import { stageOf } from "./mock-features";
import { unwrap } from "./result";

const ALL: RunState[] = [
	"Queued",
	"Claimed",
	"Planning",
	"PlanReview",
	"Working",
	"SelfReview",
	"PROpen",
	"ChangesRequested",
	"Merged",
	"Done",
	"WaitingForAnswer",
	"Blocked",
	"RetryQueued",
	"Paused",
	"Failed",
	"Cancelled",
];

describe("mock features: the read model of Flow", () => {
	it("gives each run state a stage, as `shipyard_core::feature` does", () => {
		expect(ALL.map((s) => stageOf(s, "Working"))).toEqual([
			["spec", null],
			["spec", null],
			["spec", null],
			["spec", "needs_you"],
			["build", null],
			["build", null],
			["review", null],
			["review", null],
			["ready", null],
			["ready", null],
			["build", "needs_you"],
			["build", "blocked"],
			["build", null],
			["build", "stopped"],
			["build", "stopped"],
			["build", "stopped"],
		]);
		expect(stageOf("Blocked", "Planning")).toEqual(["spec", "blocked"]);
		expect(stageOf("Paused", null)).toEqual(["build", "stopped"]);
	});

	it("joins the demo tickets, changes, runs and pull requests, each once", async () => {
		resetMock();
		expect(await unwrap(commands.featuresList())).toEqual([]);
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const list = await unwrap(commands.featuresList());
		const runs = await unwrap(commands.runsList());
		// The scenario of REQ-010: a feature whose run is Blocked shows once, in Build, blocked.
		const blocked = runs.find((r) => r.state === "Blocked");
		const of = list.filter((f) => f.ticket === `wi:${blocked?.key}`);
		expect(of.map((f) => [f.stage, f.mark, f.run])).toEqual([
			["build", "blocked", blocked?.reference],
		]);
		// Two runs of one ticket: one feature, with the newest run.
		const twice = runs.filter((r) => r.key === "ACME-12");
		expect(twice.length).toBe(2);
		expect(list.filter((f) => f.ticket === "wi:ACME-12").map((f) => f.run)).toEqual([
			twice[0]?.reference,
		]);
		// Each ticket and each pull request shows in one feature.
		const tickets = await unwrap(commands.syncItems({}));
		for (const t of tickets) expect(list.filter((f) => f.ticket === `wi:${t.key}`)).toHaveLength(1);
		const pulls = await unwrap(commands.pullsList());
		const shown = (ref: string) =>
			list.some((f) => f.pr === ref) ||
			runs.some((r) => r.pr?.reference === ref && list.some((f) => f.ticket === `wi:${r.key}`));
		for (const p of pulls) expect(shown(p.reference), p.reference).toBe(true);
		// Each change shows in one feature.
		const changes = await unwrap(commands.specsChanges());
		for (const c of changes)
			expect(list.filter((f) => f.change === `change:${c.id}`)).toHaveLength(1);
	});
});
