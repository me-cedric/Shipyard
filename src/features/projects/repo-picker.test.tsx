import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

// No parent folder is set: the picker must not clone.
vi.mock("./clone-folder", () => ({ useCloneFolder: () => ["", () => {}] }));

it("does not clone while the parent folder is empty", async () => {
	const user = userEvent.setup();
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	await unwrap(
		commands.connectionsAdd({
			name: "Hub",
			group: "forge",
			kind: "github",
			url: "https://github.com",
			user: null,
		}),
	);
	mountApp("/home/inbox");
	await user.click(await screen.findByRole("button", { name: /^Project/ }));
	await user.click(await screen.findByRole("menuitem", { name: "Clone a repository" }));
	const dialog = within(await screen.findByRole("dialog"));
	const row = await dialog.findByRole("button", { name: "Clone acme/web" });
	expect(row).toBeDisabled();
	await user.type(dialog.getByRole("searchbox", { name: "Search repositories" }), "{Enter}");
	await waitFor(() => expect(mockState().projects).toHaveLength(1));
});
