import {
	estimateSessions,
	estimateStart,
	estimateStop,
	STOPPED,
	seedEstimateAgent,
} from "./mock-estimate-agent";
import { seedWork } from "./mock-work";

const on = { readOnly: false, stopped: false };
const ids = ["auth-api", "auth-web", "export-api"];

describe("the estimate agent mock", () => {
	it("gives a proposal for each asked task and leaves the sheet as it was", () => {
		const w = seedWork();
		const before = JSON.stringify(w.sheets);
		const out = estimateStart(seedEstimateAgent(), w, "mvp-1", [...ids, "no-task"], true, on);
		if (out instanceof Promise) throw new Error("the estimate did not end");
		expect(out.map((p) => p.task)).toEqual(ids);
		for (const p of out) {
			expect(p.best).toBeLessThanOrEqual(p.likely ?? 0);
			expect(p.likely).toBeLessThanOrEqual(p.worst ?? 0);
			expect(p.assumptions.length).toBeGreaterThan(0);
		}
		expect(JSON.stringify(w.sheets)).toBe(before);
	});

	it("refuses a sealed sheet, a frozen sheet, no click, no task and stopped agents", () => {
		const a = seedEstimateAgent();
		const w = seedWork();
		expect(() => estimateStart(a, w, "mvp-1", ids, false, on)).toThrow(/click/);
		expect(() => estimateStart(a, w, "mvp-1", [], true, on)).toThrow(/no task/);
		// A task that the sheet does not hold is not a selected task.
		expect(() => estimateStart(a, w, "mvp-1", ["no-task"], true, on)).toThrow(
			/no task is selected/,
		);
		expect(() => estimateStart(a, w, "mvp-1", ids, true, { ...on, stopped: true })).toThrow(
			/agents are stopped/,
		);
		expect(() => estimateStart(a, w, "mvp-1", ids, true, { ...on, readOnly: true })).toThrow(
			/read only/,
		);
		const sheet = w.sheets["mvp-1"];
		if (sheet) sheet.frozen = true;
		expect(() => estimateStart(a, w, "mvp-1", ids, true, on)).toThrow(/frozen/);
		if (sheet) sheet.frozen = undefined;
		w.sealed = "s3cret";
		w.unlocked = true;
		expect(() => estimateStart(a, w, "mvp-1", ids, true, on)).toThrow(/sealed/);
	});

	it("shows a session while it runs, and the stop ends it with no proposal", async () => {
		const a = { ...seedEstimateAgent(), hold: true };
		const w = seedWork();
		const before = JSON.stringify(w.sheets);
		const run = estimateStart(a, w, "mvp-1", ids, true, on);
		expect(estimateSessions(a).map((s) => [s.key, s.step, s.state])).toEqual([
			["mvp-1", "estimate", "running"],
		]);
		expect(() => estimateStart(a, w, "mvp-1", ids, true, on)).toThrow(/is running/);
		estimateStop(a, "mvp-1");
		await expect(run).rejects.toBe(STOPPED);
		expect(estimateSessions(a)).toEqual([]);
		expect(JSON.stringify(w.sheets)).toBe(before);
		// Nothing runs: the stop does nothing.
		expect(estimateStop(a, "mvp-1")).toBeNull();
	});
});
