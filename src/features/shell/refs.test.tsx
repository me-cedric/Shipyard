import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByRole("navigation", { name: "Sidebar" });
	await user.keyboard("{Control>}k{/Control}");
	return screen.findByRole("combobox", { name: "Ask or tell Shipyard" });
}

describe("refs in the shell", () => {
	beforeEach(() => unwrap(commands.projectsOpen("/mock/alpha", false)));

	it("finds an entity by ref and by title in the palette", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const input = await openPalette(user);
		await user.type(input, "Q-012");
		expect(
			await screen.findByRole("option", { name: /Which issue tracker first\?/ }),
		).toBeVisible();
		await user.clear(input);
		await user.type(input, "polling");
		expect(await screen.findByRole("option", { name: /Polling sync/ })).toBeVisible();
	});

	it("puts the entity of a ref first", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const input = await openPalette(user);
		await user.type(input, "Q-012");
		const options = await screen.findAllByRole("option", { name: /Which issue tracker first/ });
		expect(options[0]).toHaveTextContent("Which issue tracker first?");
	});

	it("opens the entity with its backlinks grouped by kind with a count", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const input = await openPalette(user);
		await user.type(input, "polling");
		await user.click(await screen.findByRole("option", { name: /Polling sync/ }));
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		// One line for each linked item, in a list.
		expect(
			await within(inspector).findAllByRole("button", { name: /^Spec, .*, Resolved$/ }),
		).toHaveLength(2);
		expect(
			within(inspector).getAllByRole("button", { name: /^Change, .*, Resolved$/ }),
		).toHaveLength(1);
		expect(within(inspector).getByText("adr:0004", { selector: "code" })).toBeVisible();
	});

	it("opens a cited entity from a backlink chip with the keyboard", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const input = await openPalette(user);
		await user.type(input, "adr:0004");
		await user.keyboard("{ArrowDown}{Enter}");
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		const chip = await within(inspector).findByRole("button", {
			name: /^Spec, Spec: auth, Resolved/,
		});
		chip.focus();
		await user.keyboard("{ArrowDown}{Enter}");
		await waitFor(() =>
			expect(within(inspector).getByText("spec:auth", { selector: "code" })).toBeVisible(),
		);
		expect(
			within(inspector).queryAllByRole("button", { name: /^Spec, .*, Resolved$/ }),
		).toHaveLength(0);
	});

	it("shows ghost rows and no text for an entity that nothing cites", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const input = await openPalette(user);
		await user.type(input, "wi:SHIP-42");
		await user.click(await screen.findByRole("option", { name: /Open wi:SHIP-42/ }));
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		expect(await within(inspector).findByText("wi:SHIP-42", { selector: "code" })).toBeVisible();
		expect(within(inspector).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
	});

	it("keeps a ref in French", async () => {
		const user = userEvent.setup();
		const { mockState } = await import("@/lib/ipc/mock");
		mockState().prefs.lang = "fr";
		mountApp("/home/today");
		await screen.findByRole("navigation", { name: "Barre latérale" });
		await user.keyboard("{Control>}k{/Control}");
		await user.type(
			await screen.findByRole("combobox", { name: "Demander ou dire à Shipyard" }),
			"adr:0004",
		);
		await user.keyboard("{ArrowDown}{Enter}");
		const inspector = await screen.findByLabelText("Inspecteur", { selector: "aside" });
		expect(
			await within(inspector).findAllByRole("button", { name: /^Spécification, .*, Résolu$/ }),
		).toHaveLength(2);
	});
});
