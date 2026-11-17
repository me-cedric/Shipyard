import type { Stop } from "@/lib/ipc";
import { doStop, stopAction } from "./stop-action";

describe("stopAction (spec:app-redesign#REQ-014)", () => {
	it.each<[Stop, string]>([
		["reply", "reply"],
		["unblock", "unblock"],
		["add_budget", "addBudget"],
		["try_again", "tryAgain"],
		["resume", "resume"],
		["close_done", "closeDone"],
	])("gives the action of the fact %s", (stop, action) => {
		expect(stopAction({ stop })).toBe(action);
	});

	it("gives no action when the fact is null or missing", () => {
		expect(stopAction({ stop: null })).toBeNull();
		expect(stopAction({})).toBeNull();
	});
});

describe("doStop", () => {
	const act = {
		start: vi.fn(async () => "run-2"),
		cancel: vi.fn(),
		resume: vi.fn(),
		unblock: vi.fn(),
		closeDone: vi.fn(),
		planApprove: vi.fn(),
		planReject: vi.fn(),
	};
	const r = { id: "run-1", key: "ACME-1" };

	it("calls the command of each action; Add budget adds 2 USD unless told", async () => {
		await doStop(act as never, r, "addBudget");
		expect(act.resume).toHaveBeenLastCalledWith("run-1", 2, undefined);
		await doStop(act as never, r, "addBudget", { usd: 5, note: "go" });
		expect(act.resume).toHaveBeenLastCalledWith("run-1", 5, "go");
		await doStop(act as never, r, "resume");
		expect(act.resume).toHaveBeenLastCalledWith("run-1", null, undefined);
		await doStop(act as never, r, "unblock", { note: "n" });
		expect(act.unblock).toHaveBeenLastCalledWith("run-1", "n");
		await doStop(act as never, r, "closeDone");
		expect(act.closeDone).toHaveBeenCalledWith("run-1");
		const open = vi.fn();
		await doStop(act as never, r, "tryAgain", { open });
		expect(act.start).toHaveBeenCalledWith("ACME-1");
		expect(open).toHaveBeenCalledWith("run-2");
	});
});
