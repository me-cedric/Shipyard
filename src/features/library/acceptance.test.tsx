import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

async function mount(path: string) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp(path);
}

// spec:app-redesign#REQ-034: each sub-page has its own address and a back link to its page.
describe("Library sub-pages", () => {
	it.each([
		["/library/test-plans/coverage", "What is tested", "/library/test-plans"],
		// The code map is the source Code of the page Map: its back link goes to the doors.
		["/library/graph?source=code", "Map", "/library/home"],
		["/library/flows/matrix", "Flow matrix", "/library/flows"],
		["/library/dashboards/team/edit", "Team", "/library/dashboards"],
		["/library/reports/change-request", "Change request", "/library/reports"],
	])("opens %s with a back link to its page", async (path, title, parent) => {
		const user = userEvent.setup();
		const router = await mount(path);
		await screen.findByRole("heading", { level: 1, name: new RegExp(title) });
		const back = await waitFor(() => {
			const a = within(screen.getByRole("main"))
				.getAllByRole("link")
				.find((l) => l.getAttribute("href") === parent);
			if (!a) throw new Error(`no back link to ${parent}`);
			return a;
		});
		await user.click(back);
		await waitFor(() => expect(router.state.location.pathname).toBe(parent));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});

// spec:app-redesign#REQ-035: the reference and the file name of an item sit in the More menu, not in the header.
describe("Library More menu", () => {
	it.each(["diagrams", "capabilities", "test-plans"])(
		"holds Copy the reference, and the file name when the item has a file, on %s",
		async (slug) => {
			const user = userEvent.setup();
			const router = await mount(`/library/${slug}`);
			const more = await screen.findByRole("button", { name: "More" });
			await user.click(more);
			expect(await screen.findByRole("menuitem", { name: "Copy the reference" })).toBeVisible();
			// A diagram has no file of its own: its page offers the reference only.
			if (slug === "diagrams")
				expect(screen.queryByRole("menuitem", { name: "Copy the file name" })).toBeNull();
			else expect(screen.getByRole("menuitem", { name: "Copy the file name" })).toBeVisible();
			await user.keyboard("{Escape}");
			// The header holds no button for them.
			expect(screen.queryByRole("button", { name: "Copy the reference" })).toBeNull();
			expect(screen.queryByRole("button", { name: "Copy the file name" })).toBeNull();
			await waitFor(() => expect(router.state.status).toBe("idle"));
		},
	);
});
