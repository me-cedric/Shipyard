import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const bar = async () => within((await screen.findByRole("contentinfo")) as HTMLElement);
const top = async () => within((await screen.findByRole("banner")) as HTMLElement);

describe("status bar and context bar (shell REQ-007)", () => {
	it("has one sync and one commit action and no second one in a view", async () => {
		mountApp("/code/changes");
		const b = await bar();
		const c = await top();
		expect(c.getAllByRole("button", { name: "Sync" })).toHaveLength(1);
		expect(b.queryByRole("button", { name: "Sync" })).toBeNull();
		expect(b.getAllByRole("button", { name: "Commit" })).toHaveLength(1);
		expect(c.queryByRole("button", { name: "Commit" })).toBeNull();
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
		const sync = await (await top()).findByRole("button", { name: "Sync" });
		await user.click(sync);
		// The mock tick passes, then the pull fails: the bar shows that reason, so the sync ran.
		expect(await screen.findByRole("alert")).toHaveTextContent("uncommitted changes");
		expect(sync).toBeEnabled();
	});

	it("shows the count of active runs on top and the health shape below", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const runs = await unwrap(commands.runsList());
		const active = runs.filter((r) => r.lane === "working" || r.lane === "needs_you").length;
		mountApp("/home");
		const c = await top();
		expect(await c.findByRole("link", { name: `Active runs (${active})` })).toHaveAttribute(
			"href",
			"/factory/runs",
		);
		expect(active).toBeGreaterThan(0);
		const b = await bar();
		const link = await b.findByRole("link", { name: /Health \(2\)/ });
		expect(within(link).getByRole("img", { name: "Warning" })).toBeInTheDocument();
	});
});
