import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { openAccount } from "./test-open";
import { noteRows } from "./whats-new";

describe("What's new", () => {
	it("opens once after an update with the changelog sections, shows the version and opens again from the palette", async () => {
		const user = userEvent.setup();
		mockState().prefs.seenVersion = "0.0.9";
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		const dialog = await screen.findByRole("dialog", { name: "What's new in 0.1.0" });
		expect(within(dialog).getByText("A change.")).toBeInTheDocument();
		// One row for each note, with its chip, then the version and the way to every version.
		expect(within(dialog).getByRole("listitem")).toHaveTextContent("NewA change.");
		expect(within(dialog).getByText("Version 0.1.0")).toBeInTheDocument();
		await user.click(within(dialog).getByRole("button", { name: "All versions" }));
		expect(await within(dialog).findByRole("heading", { name: "[0.0.1]" })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		// The version is in the account menu.
		expect((await openAccount(user)).getByText("Version 0.1.0")).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await user.keyboard("{Control>}k{/Control}");
		await user.type(
			await screen.findByRole("combobox", { name: "Ask or tell Shipyard" }),
			"What's new",
		);
		await user.keyboard("{ArrowDown}{Enter}");
		expect(await screen.findByRole("dialog", { name: "What's new in 0.1.0" })).toBeInTheDocument();
	});

	it("marks a note as a fix from its heading or its first word", () => {
		expect(noteRows("## 0.2.0\n- A change.\n- Fixed the sync.\n### Fixed\n- The menu.")).toEqual([
			{ fixed: false, text: "A change." },
			{ fixed: true, text: "Fixed the sync." },
			{ fixed: true, text: "The menu." },
		]);
	});
});
