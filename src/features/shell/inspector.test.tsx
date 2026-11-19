import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const inspector = () => screen.findByLabelText("Inspector", { selector: "aside" });

async function open(user: ReturnType<typeof userEvent.setup>, ref: string) {
	await screen.findByRole("navigation", { name: "Sidebar" });
	await user.keyboard("{Control>}k{/Control}");
	await user.type(await screen.findByRole("combobox", { name: "Ask or tell Shipyard" }), ref);
	await user.keyboard("{ArrowDown}{Enter}");
	return within(await inspector());
}

describe("inspector (shell REQ-006)", () => {
	beforeEach(() => unwrap(commands.projectsOpen("/mock/alpha", false)));

	it("starts closed, inert and empty", async () => {
		mountApp("/home/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		const aside = await inspector();
		expect(aside).toHaveAttribute("data-open", "false");
		expect(aside).toHaveAttribute("inert");
	});

	it("drops the width transition for the whole drag of the separator", async () => {
		mountApp("/home/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		const aside = await inspector();
		const bar = within(aside).getByRole("separator");
		expect(aside).not.toHaveAttribute("data-resizing");
		fireEvent.pointerDown(bar, { clientX: 500 });
		fireEvent.pointerMove(bar, { clientX: 450 });
		expect(aside).toHaveAttribute("data-resizing");
		fireEvent.pointerUp(bar);
		expect(aside).not.toHaveAttribute("data-resizing");
	});

	it("shows the entity and its backlinks, and a backlink selects that entity", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const view = await open(user, "adr:0004");
		expect(await view.findByRole("heading", { name: "Linked to" })).toBeVisible();
		expect(await view.findAllByRole("button", { name: /^spec:/ })).toHaveLength(2);
		await user.click(await view.findByRole("button", { name: /^spec:auth, Spec: auth, Resolved/ }));
		await waitFor(() => expect(view.queryAllByRole("button", { name: /^spec:/ })).toHaveLength(0));
		// The box of the ref shows it as plain text.
		expect(view.getByText("spec:auth")).toBeVisible();
	});

	it("explains a link in a card: the kind, the name, what it is, the linked items, Open, Explain and Copy the ref", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
		const view = await open(user, "adr:0004");
		const aside = await inspector();
		expect(aside).toHaveClass("fixed");
		expect(await view.findByText("This item is in the project.")).toBeVisible();
		expect(view.getByText("ADR")).toBeVisible();
		expect(view.getByRole("region", { name: "Linked to" })).toBeVisible();
		expect(view.getByRole("button", { name: "Open" })).toBeVisible();
		expect(view.getByRole("button", { name: "Explain with an agent" })).toBeVisible();
		// The other actions wait behind More, each one a button.
		expect(view.queryByRole("button", { name: "Open in the map" })).toBeNull();
		await user.click(view.getByRole("button", { name: "More" }));
		expect(view.getByRole("button", { name: "Open in the map" })).toBeVisible();
		expect(view.getByRole("button", { name: "Summarise this decision" })).toBeVisible();
		await user.click(view.getByRole("button", { name: "Copy the ref" }));
		expect(await view.findByRole("button", { name: "Copied" })).toBeVisible();
	});

	it("closes with its button and moves the focus out of the panel", async () => {
		const user = userEvent.setup();
		mountApp("/home/today");
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
