import { en } from "@/lib/i18n/en";
import { defaultAutomation } from "@/lib/ipc/mock-sync";
import { fromDraft, RUN_STATES, toDraft } from "./automation-draft";

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
});
