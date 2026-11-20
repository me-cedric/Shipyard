import { en } from "@/lib/i18n/en";
import { defaultAutomation } from "@/lib/ipc/mock-sync";
import { fromDraft, RUN_STATES, STEPS, toDraft } from "./automation-draft";

describe("the automation draft", () => {
	it("round-trips the defaults with no extra key", () => {
		const a = defaultAutomation();
		expect(fromDraft(toDraft(a), en)).toEqual({ automation: a });
	});

	it("keeps a filled file as it is", () => {
		const a = {
			...defaultAutomation(),
			interval: 90,
			pickup: {
				assignee: "ada",
				label: null,
				statuses: ["To Do"],
				component: "web",
				priority: "High",
			},
			concurrency: { global: 3, per_project: 2, per_status: { "To Do": 1, "In Review": 2 } },
			status_map: { Done: { status: "Closed", labels: ["shipped"] } },
		};
		expect(fromDraft(toDraft(a), en)).toEqual({ automation: a });
	});

	it("keeps the budgets, the reviewers, the assignee and the question wait that the form does not edit", () => {
		const a = {
			...defaultAutomation(),
			reviewers: ["ada"],
			assignee: "bob",
			budgets: { day: { "*": 5 }, member: { ada: 2 } },
			questions: { remind_after_h: 8, escalate_after_h: 48 },
		};
		expect(fromDraft(toDraft(a), en)).toEqual({ automation: a });
	});

	it("keeps the permissions of the recipes", () => {
		const a = {
			...defaultAutomation(),
			recipe_writes: { feature: ["transition" as const, "open_pr" as const] },
		};
		expect(fromDraft(toDraft(a), en)).toEqual({ automation: a });
	});

	it("keeps the limits by stage and the choices of the budgets (runs-recipes REQ-006, REQ-007)", () => {
		const a = {
			...defaultAutomation(),
			concurrency: { global: 6, per_project: 4, per_stage: { plan: 2, build: 3 } },
			budgets: {
				day: {},
				member: {},
				feature: { "ACME-1": 3 },
				warn_at: 70,
				at_limit: { feature: "stop_ask" as const, day: "go_on" as const, member: "pause" as const },
			},
		};
		const d = toDraft(a);
		expect(d.perStage).toEqual({ plan: "2", build: "3", review: "" });
		expect(fromDraft(d, en)).toEqual({ automation: a });
		// A stage that a person clears has no limit.
		const cleared = fromDraft({ ...d, perStage: { ...d.perStage, plan: "" } }, en);
		expect(cleared).toMatchObject({ automation: { concurrency: { per_stage: { build: 3 } } } });
	});

	it("refuses a stage limit that is not a whole number of one or more", () => {
		const d = toDraft(defaultAutomation());
		for (const bad of ["0", "x", "-1", "1.5"])
			expect(fromDraft({ ...d, perStage: { ...d.perStage, build: bad } }, en)).toEqual({
				error: "Build: a whole number",
			});
	});

	it("has one mapping row for each run state", () => {
		expect(Object.keys(toDraft(defaultAutomation()).map)).toEqual([...RUN_STATES]);
	});

	it("refuses what the file would refuse", () => {
		const d = toDraft(defaultAutomation());
		expect(fromDraft({ ...d, interval: "29" }, en)).toEqual({ error: "Interval: at least 30 s" });
		expect(fromDraft({ ...d, interval: "" }, en)).toEqual({
			error: "Interval (s): a whole number",
		});
		expect(fromDraft({ ...d, global: "-1" }, en)).toEqual({ error: "Global: a whole number" });
		expect(fromDraft({ ...d, perProject: "x" }, en)).toEqual({
			error: "Per project: a whole number",
		});
		expect(fromDraft({ ...d, perStatus: "To Do=x" }, en)).toEqual({
			error: "Per status: name=number, name=number",
		});
	});

	it("maps each internal state onto exactly one of the eight steps", () => {
		expect(STEPS).toHaveLength(8);
		const states: string[] = STEPS.flatMap(([, list]) => [...list]);
		expect([...states].sort()).toEqual([...RUN_STATES].sort());
	});
});
