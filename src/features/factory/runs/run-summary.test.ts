import type { RunView } from "@/lib/ipc";
import { agentOf } from "./run-summary";

const run = (states: string[]) =>
	({
		workflow: "feature",
		steps: ["plan", "build", "review"].map((id, i) => ({ id, state: states[i] })),
	}) as unknown as Pick<RunView, "steps" | "workflow">;

describe("agentOf", () => {
	it("names the step that works, else the next step that is not done, else the recipe", () => {
		expect(agentOf(run(["done", "running", "pending"]))).toBe("Build");
		// A run that stopped between two steps: the review was reset and waits.
		expect(agentOf(run(["done", "done", "pending"]))).toBe("Review");
		expect(agentOf(run(["done", "done", "pending"]), { review: "Reviewer" })).toBe("Reviewer");
		expect(agentOf(run(["done", "done", "done"]))).toBe("Feature");
	});
});
