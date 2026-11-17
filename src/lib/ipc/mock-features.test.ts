import { describe, expect, it } from "vitest";
import { type ArtifactStatus, commands, type RunState } from "./bindings";
import { DEMO_FOLDER, resetMock } from "./mock";
import { features, stageOf, stopOf } from "./mock-features";
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

	it("calls a change with only its proposal an idea, and a change with a spec a spec", () => {
		const change = (id: string, spec: ArtifactStatus) => ({
			id,
			title: id,
			path: `docs/openspec/changes/${id}`,
			validated: false,
			artifacts: [
				{
					artifact: "proposal",
					capability: null,
					path: "proposal.md",
					status: "draft" as const,
					findings: [],
				},
				{ artifact: "spec", capability: "x", path: "specs/x/spec.md", status: spec, findings: [] },
			],
		});
		const list = features(
			[],
			[change("bare", "missing"), change("specced", "unchecked")],
			[],
			[],
			() => "",
		);
		expect(list.map((f) => [f.change, f.stage])).toEqual([
			["change:bare", "idea"],
			["change:specced", "spec"],
		]);
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

	it("gives each card who works on it and the facts of its state line (REQ-011)", async () => {
		resetMock();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const list = await unwrap(commands.featuresList());
		const of = (key: string) => list.find((f) => f.ticket === `wi:${key}`);
		// A run in Build whose agent works and asks for two effects (picture 003).
		const building = of("ACME-2");
		expect(building?.who).toMatchObject({ agent: true });
		expect(building).toMatchObject({ runState: "Working", approvals: 2, questions: 0 });
		// No agent works: the assignee of the ticket. The checks come from the pull request.
		expect(of("ACME-5")).toMatchObject({
			who: { name: "Grace Hopper", agent: false },
			runState: "PROpen",
			checks: "passing",
		});
		expect(of("ACME-7")).toMatchObject({ who: null, checks: "failing" });
		expect(of("ACME-1")).toMatchObject({ runState: "WaitingForAnswer", questions: 1 });
	});

	it("gives each stop state its one action, as `stop_of` does (REQ-014)", () => {
		const at = (s: RunState) => stopOf(s, null, null);
		expect(ALL.map(at)).toEqual([
			...Array(10).fill(null),
			"reply",
			"unblock",
			null,
			"resume",
			"try_again",
			null,
		]);
		expect(stopOf("Paused", "budget", null)).toBe("add_budget");
		expect(stopOf("Paused", "max_turns", null)).toBe("resume");
		expect(stopOf("Blocked", "nothing_to_deliver", null)).toBe("close_done");
		// The pull request ended on the code host while the run is not final.
		for (const pr of ["merged", "closed"]) {
			expect(stopOf("PROpen", null, pr)).toBe("close_done");
			expect(stopOf("Paused", "budget", pr)).toBe("close_done");
			expect(stopOf("Merged", null, pr)).toBeNull();
			expect(stopOf("Done", null, pr)).toBeNull();
			expect(stopOf("Failed", null, pr)).toBe("try_again");
		}
		expect(stopOf("PROpen", null, "open")).toBeNull();
	});

	it("names the stop action of each demo run and of its feature", async () => {
		resetMock();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const runs = await unwrap(commands.runsList());
		const list = await unwrap(commands.featuresList());
		const of = (key: string) => list.find((f) => f.ticket === `wi:${key}`)?.stop;
		// ACME-6 is paused at its budget.
		expect(of("ACME-6")).toBe("add_budget");
		expect(of("ACME-9")).toBe("unblock");
		expect(of("ACME-1")).toBe("reply");
		expect(of("ACME-5")).toBeNull();
		expect(runs.find((r) => r.state === "Failed")?.stop).toBe("try_again");
	});
});
