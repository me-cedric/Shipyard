import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const bar = async () => within((await screen.findByRole("contentinfo")) as HTMLElement);

describe("status bar (shell REQ-007)", () => {
	it("has one sync and one commit action and no second one in a view", async () => {
		mountApp("/code/changes");
		const b = await bar();
		expect(b.getAllByRole("button", { name: "Sync" })).toHaveLength(1);
		expect(b.getAllByRole("button", { name: "Commit" })).toHaveLength(1);
		const main = within(await screen.findByRole("main"));
		expect(main.queryByRole("button", { name: /^Sync$/ })).toBeNull();
	});

	it("keeps the commit action off with nothing staged", async () => {
		mountApp("/home");
		expect(await (await bar()).findByRole("button", { name: "Commit" })).toBeDisabled();
	});

	it("runs one sync from the action", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		const sync = await (await bar()).findByRole("button", { name: "Sync" });
		await user.click(sync);
		// The mock tick passes, then the pull fails: the bar shows that reason, so the sync ran.
		expect(await screen.findByRole("alert")).toHaveTextContent("uncommitted changes");
		expect(sync).toBeEnabled();
	});

	it("shows the count of active runs and the health shape", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const runs = await unwrap(commands.runsList());
		const active = runs.filter((r) => r.lane === "working" || r.lane === "needs_you").length;
		mountApp("/home");
		const b = await bar();
		const label = await b.findByText("Active runs");
		await waitFor(() => expect(label.parentElement).toHaveTextContent(`Active runs${active}`));
		expect(active).toBeGreaterThan(0);
		const link = await b.findByRole("link", { name: /Health \(2\)/ });
		expect(within(link).getByRole("img", { name: "Warning" })).toBeInTheDocument();
	});
});
