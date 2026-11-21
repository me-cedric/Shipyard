import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { resumeLine, takeLine } from "./take-control";

// The terminal draws with xterm, which jsdom cannot: the shell still starts and gets its lines.
vi.mock("@xterm/xterm", () => ({
	Terminal: class {
		cols = 80;
		rows = 24;
		loadAddon() {}
		registerLinkProvider() {
			return { dispose() {} };
		}
		open() {}
		focus() {}
		write() {}
		onData() {
			return { dispose() {} };
		}
		onResize() {
			return { dispose() {} };
		}
		dispose() {}
	},
}));
vi.mock("@xterm/addon-fit", () => ({
	FitAddon: class {
		fit() {}
	},
}));

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

/** The first running session of a run, with a unit that the tool can resume. */
async function liveRun(runner = "claude") {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const s = (await unwrap(commands.sessionsList())).find(
		(x) => x.state === "running" && x.pull == null && x.step !== "estimate",
	);
	if (!s) throw new Error("the demo has a running session");
	const run = mockState().factory.runs.find((r) => r.id === s.run);
	const step = run?.steps.find((x) => x.id === s.step);
	if (!run || !step) throw new Error("no step");
	step.units = [
		{
			id: step.id,
			state: "running",
			runner,
			session: "sess-1",
			dir: "/work/x",
			started: 1,
			last: 2,
		},
	];
	return { s, run };
}

describe("the line that takes control", () => {
	it("resumes Claude Code and Codex and no other tool, and quotes the folder", () => {
		expect(resumeLine("claude", "abc-1")).toBe("claude --resume abc-1");
		expect(resumeLine("codex", "abc")).toBe("codex resume abc");
		expect(resumeLine("gemini", "abc")).toBeNull();
		expect(resumeLine("claude", null)).toBeNull();
		// An id that a shell could read as more than a name never gives a line.
		expect(resumeLine("claude", "a; b")).toBeNull();
		expect(takeLine("/my dir/o'k", "claude --resume s")).toBe(
			"cd '/my dir/o'\\''k' && claude --resume s",
		);
	});
});

// spec:shell-setup-rights#REQ-002: Take control stops the session and resumes it in the terminal.
describe("Crew / Sessions: Take control of a run session", () => {
	it("stops the run and runs the resume command of Claude Code in the Shipyard terminal", async () => {
		const user = userEvent.setup();
		const write = vi.spyOn(commands, "terminalWrite");
		const { s, run } = await liveRun();
		const router = mountApp(`/crew/sessions?session=${encodeURIComponent(`${s.run}/${s.step}`)}`);
		const panel = within(await screen.findByRole("region", { name: /^Live output of/ }));
		await user.click(panel.getByRole("button", { name: "Take control" }));
		await user.click(
			panel.getByRole("button", { name: /^Stop .* and open it in the terminal\?$/ }),
		);
		await waitFor(() => expect(run.state).toBe("Cancelled"));
		await waitFor(() =>
			expect(write).toHaveBeenCalledWith(
				expect.any(String),
				"cd '/work/x' && claude --resume sess-1\r",
			),
		);
		await idle(router);
	});

	it("shows the live output of a tool that writes a history, and none for one that does not", async () => {
		const { s } = await liveRun();
		const path = `/crew/sessions?session=${encodeURIComponent(`${s.run}/${s.step}`)}`;
		mountApp(path);
		const panel = within(await screen.findByRole("region", { name: /^Live output of/ }));
		expect(await panel.findByText(/The change is ready\./)).toBeVisible();
		expect(panel.queryByText("This session sends no live output to Shipyard.")).toBeNull();
	});

	it("shows no live output and no Take control for a tool with no history file", async () => {
		const { s } = await liveRun("gemini");
		mountApp(`/crew/sessions?session=${encodeURIComponent(`${s.run}/${s.step}`)}`);
		const panel = within(await screen.findByRole("region", { name: /^Live output of/ }));
		expect(await panel.findByText("This session sends no live output to Shipyard.")).toBeVisible();
		expect(panel.queryByRole("button", { name: "Take control" })).toBeNull();
	});

	it("keeps Take control off without the right to start runs", async () => {
		const { s } = await liveRun();
		mockState().person = {
			member: "ada",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp(`/crew/sessions?session=${encodeURIComponent(`${s.run}/${s.step}`)}`);
		const panel = within(await screen.findByRole("region", { name: /^Live output of/ }));
		await waitFor(() => expect(panel.getByRole("button", { name: "Take control" })).toBeDisabled());
	});
});

describe("Crew / Sessions: Take control of a session of this computer", () => {
	it("stops the session and resumes it in the terminal with the command of its tool", async () => {
		const user = userEvent.setup();
		const write = vi.spyOn(commands, "terminalWrite");
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/crew/sessions");
		await user.click(await screen.findByRole("button", { name: "Take control of codex beta" }));
		await waitFor(() =>
			expect(mockState().machine.sessions.some((x) => x.pid === 4188)).toBe(false),
		);
		await waitFor(() =>
			expect(write).toHaveBeenCalledWith(
				expect.any(String),
				"cd '/mock/beta' && codex resume codex-beta-1\r",
			),
		);
		await idle(router);
	});

	it("stops nothing when the person says no, and offers no Take control to an ended session", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().confirm = false;
		mountApp("/crew/sessions");
		await user.click(await screen.findByRole("button", { name: "Take control of claude alpha" }));
		expect(mockState().machine.sessions.some((x) => x.pid === 4101)).toBe(true);
		expect(screen.getAllByRole("button", { name: /^Take control of / })).toHaveLength(2);
	});

	it("refuses a session that has no resume command and a click that is not a person", async () => {
		await expect(unwrap(commands.machineSessionTake(4101, false))).rejects.toBeDefined();
		Object.assign(mockState().machine.sessions[0] ?? {}, { runner: "gemini", session: "" });
		await expect(unwrap(commands.machineSessionTake(4101, true))).rejects.toBeDefined();
		expect(mockState().machine.sessions.some((x) => x.pid === 4101)).toBe(true);
	});
});
