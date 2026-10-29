import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { parsePlan } from "./impacts";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));

describe("Code / Impacts", () => {
	it("parses the three lists of a plan", () => {
		const plan =
			"## Axes\n\n- data: high\n- security: none\n\n## Stale refs\n\n- spec:auth\n\n## Actions\n\n1. A.\n2. B.\n";
		expect(parsePlan(plan)).toEqual({
			axes: [
				["data", "high"],
				["security", "none"],
			],
			stale: ["spec:auth"],
			actions: ["A.", "B."],
		});
	});

	it("lists the past reports and opens one with its seven axes and its digest", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/impacts");
		expect(await screen.findByRole("heading", { name: "Past reports (1)" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /2026-10-28/ }));
		expect(await screen.findByRole("heading", { name: "Axes (7)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Stale refs (0)" })).toBeInTheDocument();
		expect(await screen.findByText(/The release date holds/)).toBeInTheDocument();
	});

	it("runs Analyze with a click, rates the contracts axis and shows the stale refs", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/impacts");
		await user.click(await screen.findByRole("button", { name: "Analyze" }));
		expect(await screen.findByRole("heading", { name: "Past reports (2)" })).toBeInTheDocument();
		const axes = await screen.findByRole("region", { name: "Axes" });
		expect(within(axes).getByRole("img", { name: "high" })).toBeInTheDocument();
		expect(screen.getByText("spec:auth")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Actions (2)" })).toBeInTheDocument();
		await waitFor(() => expect(screen.getByText(/moves the release/)).toBeInTheDocument());
	});
});
