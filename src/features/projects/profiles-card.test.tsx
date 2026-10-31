import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

async function choose(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
	await user.click(await screen.findByRole("combobox", { name: field }));
	await user.click(await screen.findByRole("option", { name: option }));
}

describe("Settings / Project profiles", () => {
	it("sets a page mode per profile and assigns a profile by e-mail", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/settings/project");
		await screen.findByRole("region", { name: "Profiles" });
		await choose(user, "Code / Terminal", "Hidden");
		await waitFor(() =>
			expect(mockState().projects[0]?.overrides.pageModes).toEqual({
				pm: { "code/terminal": "hidden" },
			}),
		);
		await user.type(screen.getByRole("textbox", { name: "E-mail" }), " Ada@Example.com ");
		await choose(user, "Assign Profile", "Developer");
		await user.click(screen.getByRole("button", { name: "Assign" }));
		await waitFor(() =>
			expect(mockState().projects[0]?.overrides.assignments).toEqual({
				"ada@example.com": "developer",
			}),
		);
		const people = screen.getByRole("list", { name: "People" });
		await user.click(within(people).getByRole("button", { name: "Remove ada@example.com" }));
		await waitFor(() => expect(mockState().projects[0]?.overrides.assignments).toBeNull());
	});

	it("hides a page and locks another for the profile that the e-mail gets", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const project = mockState().projects[0];
		if (project)
			project.overrides = {
				...project.overrides,
				assignments: { "ada@example.com": "qa" },
				pageModes: { qa: { "code/terminal": "hidden", "code/history": "read-only" } },
			};
		mockState().email = "ada@example.com";
		const router = mountApp("/code/history");
		await screen.findByRole("link", { name: "Local changes" }, { timeout: 10_000 });
		const tabs = screen.getByRole("navigation", { name: "Tabs" });
		expect(within(tabs).queryByRole("link", { name: "Terminal" })).toBeNull();
		expect(screen.getByRole("group", { name: "Read only" })).toBeDisabled();
		await router.navigate({ to: "/code/branches" });
		await waitFor(() => expect(screen.queryByRole("group", { name: "Read only" })).toBeNull());
	}, 15_000);
});
