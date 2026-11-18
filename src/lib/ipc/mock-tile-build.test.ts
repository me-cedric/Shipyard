import { reviewSessions, reviewStop, seedAgentPr } from "./mock-agent-pr";
import { sessions, tileBuild } from "./mock-tile-build";

describe("the tile build mock", () => {
	it("proposes a tile of the catalogue from the words, after a turn that is a session", async () => {
		const a = seedAgentPr();
		const job = tileBuild(a, false, "team", "Runs by state", 1);
		const [row] = sessions(reviewSessions(a));
		expect(row).toMatchObject({ key: "team", step: "tile", state: "running" });
		expect(await job).toEqual({ kind: "runs", title: "Runs by state", w: 4, h: 3 });
		expect(sessions(reviewSessions(a))).toEqual([]);
		expect((await tileBuild(a, false, "team", "something else", 1)).kind).toBe("work");
	});

	it("stops with the stop of its session", async () => {
		const a = seedAgentPr();
		const job = tileBuild(a, false, "team", "Runs by state", 1);
		const pull = sessions(reviewSessions(a))[0]?.pull as number;
		reviewStop(a, pull);
		await expect(job).rejects.toBe("the tile build was stopped");
		expect(a.running).toEqual([]);
	});

	it("refuses on a spent budget, on a read-only dashboard and without words", async () => {
		const a = seedAgentPr();
		await expect(tileBuild(a, false, "team", "spent", 1)).rejects.toMatch(/is spent: the review/);
		await expect(tileBuild(a, false, "team", "runs", 0.05)).rejects.toMatch(/is spent: the tile/);
		await expect(tileBuild(a, true, "team", "runs", 1)).rejects.toMatch(/is read only/);
		await expect(tileBuild(a, false, "team", " ", 1)).rejects.toMatch(/say what/);
		await expect(tileBuild(a, false, "team", "runs", null)).rejects.toMatch(/positive number/);
		a.stopped = true;
		await expect(tileBuild(a, false, "team", "runs", 1)).rejects.toMatch(/agents are stopped/);
		expect(a.running).toEqual([]);
	});
});
