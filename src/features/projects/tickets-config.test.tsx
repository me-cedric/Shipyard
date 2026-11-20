import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const mount = async () => {
	await withTracker();
	await importAll();
	const router = mountApp("/setup/project?page=tickets");
	return { user: userEvent.setup(), router };
};

describe("Setup / Tickets, Add a kind (REQ-005)", () => {
	it("adds a kind that the issue tracker has, under a parent, and shows it in the hierarchy", async () => {
		const { user, router } = await mount();
		await user.click(await screen.findByRole("button", { name: "Add" }));
		await user.type(screen.getByRole("textbox", { name: "Kind" }), "Spike");
		await user.click(screen.getByRole("button", { name: "Add" }));
		// The kind is a chip, and the hierarchy shows it under Story.
		expect(await screen.findByRole("button", { name: "Remove Spike" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().delivery.tickets.extraKinds).toEqual([{ name: "Spike", parent: "story" }]),
		);
		const holds = within(
			screen.getByRole("heading", { name: "What holds what" }).parentElement as HTMLElement,
		);
		// The chip and the box of the hierarchy.
		expect(holds.getAllByText("Spike")).toHaveLength(2);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("refuses a kind with no type in the issue tracker", async () => {
		const { user } = await mount();
		await user.click(await screen.findByRole("button", { name: "Add" }));
		await user.type(screen.getByRole("textbox", { name: "Kind" }), "Nonsense");
		await user.click(screen.getByRole("button", { name: "Add" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("no type named Nonsense");
		expect(screen.queryByRole("button", { name: "Remove Nonsense" })).toBeNull();
		expect(mockState().delivery.tickets.extraKinds).toEqual([]);
	});
});
