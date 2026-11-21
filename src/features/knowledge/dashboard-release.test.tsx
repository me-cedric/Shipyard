import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const f = en.library.fn.dashboards;

// spec:library-functions#REQ-010 (the release list is a mock command until code-host-tickets lands)
describe("Release picker of Dashboards", () => {
	it("shows the data of the chosen release in the tiles", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		await unwrap(
			commands.dashboardSaveOne(
				"team",
				{ title: "Team", tiles: [{ id: "a", kind: "tracker-assignee", x: 0, y: 0, w: 4, h: 3 }] },
				null,
			),
		);
		const router = mountApp("/knowledge/dashboards");
		const tile = within(await screen.findByRole("region", { name: "Items by assignee" }));
		await user.click(await screen.findByRole("button", { name: "More Items by assignee" }));
		await user.click(await screen.findByRole("menuitemcheckbox", { name: "Show as table" }));
		const total = async () =>
			within(await tile.findByRole("table"))
				.getAllByRole("row")
				.slice(1)
				.reduce((n, r) => n + Number(r.lastElementChild?.textContent), 0);
		await waitFor(async () => expect(await total()).toBe(10));
		await user.click(await screen.findByRole("combobox", { name: f.release }));
		expect(await screen.findByRole("option", { name: f.allReleases })).toBeVisible();
		await user.click(await screen.findByRole("option", { name: "MVP 1" }));
		await waitFor(async () => expect(await total()).toBe(4));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
