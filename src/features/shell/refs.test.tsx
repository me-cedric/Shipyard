import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByRole("navigation", { name: "Sidebar" });
	await user.keyboard("{Control>}k{/Control}");
	return screen.findByRole("combobox");
}

describe("refs in the shell", () => {
	beforeEach(() => unwrap(commands.projectsOpen("/mock/alpha", false)));

	it("finds an entity by ref and by title in the palette", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		const input = await openPalette(user);
		await user.type(input, "Q-012");
		expect(
			await screen.findByRole("option", { name: /q:Q-012 Which tracker first\?/ }),
		).toBeVisible();
		await user.clear(input);
		await user.type(input, "polling");
		expect(await screen.findByRole("option", { name: /adr:0004 Polling sync/ })).toBeVisible();
	});

	it("puts the entity of a ref first", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		const input = await openPalette(user);
		await user.type(input, "Q-012");
		const options = await screen.findAllByRole("option", { name: /Q-012/ });
		expect(options[0]).toHaveTextContent("q:Q-012 Which tracker first?");
	});

	it("opens the entity with its backlinks grouped by kind with a count", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		const input = await openPalette(user);
		await user.type(input, "polling");
		await user.click(await screen.findByRole("option", { name: /adr:0004/ }));
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		expect(await within(inspector).findByRole("heading", { name: "Spec (2)" })).toBeVisible();
		expect(within(inspector).getByRole("heading", { name: "Change (1)" })).toBeVisible();
		expect(
			within(inspector).getByRole("button", {
				name: /^adr:0004, Polling sync with local mirror, Resolved$/,
			}),
		).toBeVisible();
	});

	it("opens a cited entity from a backlink chip with the keyboard", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		const input = await openPalette(user);
		await user.type(input, "adr:0004");
		await user.keyboard("{Enter}");
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		const chip = await within(inspector).findByRole("button", {
			name: /spec:auth, Spec: auth, Resolved/,
		});
		chip.focus();
		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(
				within(inspector).getByRole("button", { name: /^spec:auth, Spec: auth, Resolved$/ }),
			).toBeVisible(),
		);
		expect(within(inspector).queryByRole("heading", { name: /Spec \(/ })).toBeNull();
	});

	it("shows ghost rows and no text for an entity that nothing cites", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		const input = await openPalette(user);
		await user.type(input, "wi:SHIP-42");
		await user.click(await screen.findByRole("option", { name: /Open wi:SHIP-42/ }));
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		expect(
			await within(inspector).findByRole("button", { name: "wi:SHIP-42, Unresolved" }),
		).toBeVisible();
		expect(within(inspector).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
	});

	it("keeps a ref in French", async () => {
		const user = userEvent.setup();
		const { mockState } = await import("@/lib/ipc/mock");
		mockState().prefs.lang = "fr";
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Barre latérale" });
		await user.keyboard("{Control>}k{/Control}");
		await user.type(await screen.findByRole("combobox"), "adr:0004");
		await user.keyboard("{Enter}");
		const inspector = await screen.findByLabelText("Inspecteur", { selector: "aside" });
		expect(
			await within(inspector).findByRole("heading", { name: "Spécification (2)" }),
		).toBeVisible();
	});
});
