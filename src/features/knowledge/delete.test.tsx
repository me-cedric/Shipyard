import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { inspector, mountKnowledge } from "./harness";

const PAGE = "docs/handbook/getting-started.md";
const files = () => mockState().knowledge.files;

describe("Knowledge: delete an item", () => {
	it("deletes from the item menu after one confirm and refreshes the list", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		fireEvent.contextMenu(await screen.findByRole("button", { name: "Getting started" }));
		await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
		await waitFor(() => expect(files()[PAGE]).toBeUndefined());
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Getting started" })).toBeNull(),
		);
	});

	it("deletes from the inspector header and closes the inspector", async () => {
		const user = userEvent.setup();
		await mountKnowledge("handbook");
		await user.click(await screen.findByRole("button", { name: "Getting started" }));
		await user.click(await within(await inspector()).findByRole("button", { name: "Delete" }));
		await waitFor(() => expect(files()[PAGE]).toBeUndefined());
		await waitFor(async () => expect(await inspector()).toHaveAttribute("data-open", "false"));
	});
});
