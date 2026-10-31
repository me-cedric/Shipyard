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

describe("project actions of the palette", () => {
	it("lists Switch project and runs Close project", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		await openPalette(user);
		const dialog = within(await screen.findByRole("dialog"));
		expect(dialog.getByRole("option", { name: /^Switch project/ })).toBeVisible();
		await user.keyboard("Close project{Enter}");
		await waitFor(async () => expect(await unwrap(commands.projectsActive())).toBeNull());
		expect(mockState().projects).toHaveLength(1);
	});

	it("hides Close project when no project is open", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		const input = await openPalette(user);
		await user.type(input, "Close project");
		expect(screen.queryByRole("option", { name: /^Close project/ })).toBeNull();
	});
});

describe("palette pages and tickets", () => {
	it("lists a go action for a tab", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		expect(await screen.findByRole("option", { name: "Specs / Questions" })).toBeVisible();
	});

	it("finds a ticket by its key", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const item = { key: "ACME-7", title: "Pay the invoice", status: "To do" };
		mockState().sync.mirror.push(item as never);
		mountApp("/home/inbox");
		await openPalette(user);
		await user.keyboard("ACME-7");
		expect(await screen.findByRole("option", { name: /^wi:ACME-7 Pay the invoice/ })).toBeVisible();
	});

	it("opens the page of a ref, selects it, and drops it when the view changes", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/inbox");
		await openPalette(user);
		await user.keyboard("adr:0004{Enter}");
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		expect(await within(inspector).findByRole("button", { name: /^adr:0004/ })).toBeVisible();
		await waitFor(() => expect(router.state.location.pathname).toBe("/design/decisions"));
		// The page opens on the record, not on its first item.
		const decisions = await screen.findByRole("list", { name: "Decisions" });
		expect(await within(decisions).findByRole("button", { name: /0004/ })).toHaveAttribute(
			"aria-current",
			"true",
		);
		expect(within(inspector).getByRole("button", { name: /^adr:0004/ })).toBeVisible();
		await router.navigate({ to: "/specs/questions" });
		await waitFor(() =>
			expect(within(inspector).queryByRole("button", { name: /^adr:0004/ })).toBeNull(),
		);
	});
});
