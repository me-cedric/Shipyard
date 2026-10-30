import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("What's new", () => {
	it("opens once after an update with the changelog sections, shows the version and opens again from the palette", async () => {
		const user = userEvent.setup();
		mockState().prefs.seenVersion = "0.0.9";
		mountApp("/home/inbox");
		const dialog = await screen.findByRole("dialog", { name: "What's new in 0.1.0" });
		expect(within(dialog).getByText("A change.")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(screen.getByText("Version 0.1.0")).toBeInTheDocument();
		await user.keyboard("{Control>}k{/Control}");
		await user.type(await screen.findByRole("combobox"), "What's new");
		await user.keyboard("{Enter}");
		expect(await screen.findByRole("dialog", { name: "What's new in 0.1.0" })).toBeInTheDocument();
	});
});
