import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { Diagrams } from "./diagrams";
import { mountDesign } from "./harness";

vi.mock("@/ui/organisms/excalidraw-board", () => ({
	ExcalidrawBoard: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

const rows = async () => within(await screen.findByRole("list", { name: "Diagrams" }));

describe("Design: delete an item", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		mockState().confirm = true;
	});

	it("offers Delete in the item menu, asks once, trashes the file and refreshes the list", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		const spy = vi.spyOn(commands, "filesDelete");
		const row = (await rows()).getByRole("button", { name: /context/ });
		fireEvent.contextMenu(row);
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
		expect(spy.mock.calls[0]?.[0]).toMatch(/^docs\/.*context/);
		await waitFor(() =>
			expect(
				within(screen.getByRole("list", { name: "Diagrams" })).queryByRole("button", {
					name: /context/,
				}),
			).toBeNull(),
		);
	});

	it("keeps the file when the person declines", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		mockState().confirm = false;
		const spy = vi.spyOn(commands, "filesDelete");
		fireEvent.contextMenu((await rows()).getByRole("button", { name: /context/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await new Promise((r) => setTimeout(r, 50));
		expect(spy).not.toHaveBeenCalled();
	});
});
