import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { SPACE_IDS } from "./spaces";

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByRole("navigation", { name: "Sidebar" });
	await user.keyboard("{Control>}k{/Control}");
	return screen.findByRole("combobox");
}

describe("command palette (shell REQ-005)", () => {
	it("lists an action for each space, with its shortcut", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		const dialog = within(await screen.findByRole("dialog"));
		for (const i of SPACE_IDS.keys()) {
			const option = dialog.getByRole("option", { name: new RegExp(`Ctrl\\+${i + 1}$`) });
			expect(option).toBeVisible();
		}
		expect(dialog.getByRole("option", { name: /Toggle inspector.*Ctrl\+I$/ })).toBeVisible();
		expect(dialog.getByText(/^Actions \(\d+\)$/)).toBeVisible();
	});

	it("runs an action by name with Enter and closes", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		await user.keyboard("Toggle inspector{Enter}");
		const inspector = screen.getByLabelText("Inspector", { selector: "aside" });
		await waitFor(() => expect(inspector).toHaveAttribute("data-open", "true"));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("opens a ref with Enter", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/inbox");
		await openPalette(user);
		await user.keyboard("adr:0004{Enter}");
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		expect(await within(inspector).findByRole("button", { name: /^adr:0004/ })).toBeVisible();
	});

	it("hides an action that cannot run", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		const input = await openPalette(user);
		// Nothing is staged, so the commit action is off.
		await user.type(input, "Commit");
		expect(screen.queryByRole("option", { name: /^Commit/ })).toBeNull();
	});

	it("shows French labels after the language changes", async () => {
		const user = userEvent.setup();
		mockState().prefs.lang = "fr";
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Barre latérale" });
		await user.keyboard("{Control>}k{/Control}");
		expect(await screen.findByRole("option", { name: /Basculer l'inspecteur/ })).toBeVisible();
	});
});
