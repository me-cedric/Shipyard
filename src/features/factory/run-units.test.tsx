import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { RunDetail } from "./runs/run-detail";
import { resumeCommand } from "./runs/run-units";

describe("Factory / run sessions", () => {
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("builds the terminal command with the folder and the session, quoted", () => {
		expect(resumeCommand("/work/t1", "abc-123")).toBe("cd '/work/t1' && claude --resume 'abc-123'");
		expect(resumeCommand("/my dir/o'k", "s")).toBe("cd '/my dir/o'\\''k' && claude --resume 's'");
	});

	it("a run page lists its units: Follow toggles, and a running unit cannot open in the terminal", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
		renderApp(
			<ShellProvider>
				<RunDetail id={run?.id ?? ""} />
			</ShellProvider>,
		);
		const done = await screen.findByRole("listitem", { name: "t1" });
		expect(within(done).getByRole("button", { name: "Open in terminal" })).toBeEnabled();
		const live = screen.getByRole("listitem", { name: "t2" });
		expect(within(live).getByRole("button", { name: "Open in terminal" })).toBeDisabled();
		const follow = within(live).getByRole("button", { name: "Follow" });
		expect(follow).toHaveAttribute("aria-pressed", "false");
		await user.click(follow);
		expect(follow).toHaveAttribute("aria-pressed", "true");
		expect(screen.queryByRole("listitem", { name: "t4" })).toBeNull();
	});
});
