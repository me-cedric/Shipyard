import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const inspector = () => screen.findByLabelText("Inspector", { selector: "aside" });

async function open(user: ReturnType<typeof userEvent.setup>, ref: string) {
	await screen.findByRole("navigation", { name: "Sidebar" });
	await user.keyboard("{Control>}k{/Control}");
	await user.type(await screen.findByRole("combobox"), ref);
	await user.keyboard("{Enter}");
	return within(await inspector());
}

describe("inspector (shell REQ-006)", () => {
	beforeEach(() => unwrap(commands.projectsOpen("/mock/alpha", false)));

	it("starts closed, inert and empty", async () => {
		mountApp("/home/inbox");
		await screen.findByRole("navigation", { name: "Sidebar" });
		const aside = await inspector();
		expect(aside).toHaveAttribute("data-open", "false");
		expect(aside).toHaveAttribute("inert");
	});

	it("shows the entity and its backlinks, and a backlink selects that entity", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		const view = await open(user, "adr:0004");
		expect(await view.findByRole("heading", { name: "Spec (2)" })).toBeVisible();
		await user.click(await view.findByRole("button", { name: /^spec:auth, Spec: auth, Resolved/ }));
		await waitFor(() => expect(view.queryByRole("heading", { name: /Spec \(/ })).toBeNull());
		expect(view.getByRole("button", { name: /^spec:auth, Spec: auth, Resolved$/ })).toBeVisible();
	});

	it("closes with its button and moves the focus out of the panel", async () => {
		const user = userEvent.setup();
		mountApp("/home/inbox");
		const view = await open(user, "adr:0004");
		const aside = await inspector();
		await waitFor(() => expect(aside).toHaveAttribute("data-open", "true"));
		// The palette gives the focus back when it unmounts: wait for that first.
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		const close = view.getByRole("button", { name: "Close" });
		await user.click(close);
		await waitFor(() => expect(aside).toHaveAttribute("data-open", "false"));
		expect(aside.contains(document.activeElement)).toBe(false);
	});
});
