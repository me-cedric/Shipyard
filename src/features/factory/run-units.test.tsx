import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { runHref } from "@/lib/shell";
import { mountApp } from "@/test/mount";
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
		mountApp(`/factory/runs/${run?.id}?unit=t1`);
		const done = await screen.findByRole("listitem", { name: "Build 1" });
		expect(within(done).getByRole("button", { name: "Open in terminal" })).toBeEnabled();
		const live = screen.getByRole("listitem", { name: "Build 2" });
		expect(within(live).getByRole("button", { name: "Open in terminal" })).toBeDisabled();
		const follow = within(live).getByRole("button", { name: "Follow" });
		expect(follow).toHaveAttribute("aria-pressed", "false");
		await user.click(follow);
		expect(follow).toHaveAttribute("aria-pressed", "true");
		expect(screen.queryByRole("listitem", { name: "Build 4" })).toBeNull();
	});

	it("shows the step name, keeps the id in the title and focuses the session of the link", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
		const router = mountApp(`/factory/runs/${run?.id}?unit=t1`);
		const first = await screen.findByRole("listitem", { name: "Build 1" });
		expect(within(first).getByTitle("t1")).toHaveTextContent("Build 1");
		await waitFor(() => expect(first).toHaveFocus());
		// A second link to the same run opens the Workflow tab and focuses the second session.
		await router.navigate(runHref(run?.id ?? "", "t2"));
		const second = await screen.findByRole("listitem", { name: "Build 2" });
		await waitFor(() => expect(second).toHaveFocus());
		expect(screen.getByRole("tab", { name: "Workflow" })).toHaveAttribute("aria-selected", "true");
	});

	it("keeps the tab in the address: a reload opens the same tab", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
		const router = mountApp(`/factory/runs/${run?.id}`);
		await user.click(await screen.findByRole("tab", { name: "Workflow" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ tab: "workflow" }));
		await user.click(screen.getByRole("tab", { name: "Activity" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		screen.getByRole("tab", { name: "Workflow" });
	});

	it("opens the tab that the address names", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const run = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-2");
		mountApp(`/factory/runs/${run?.id}?tab=changes`);
		expect(await screen.findByRole("tab", { name: /^Changes/ })).toHaveAttribute(
			"aria-selected",
			"true",
		);
	});
});
