import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

describe("Code / the files to commit (look pass 2)", () => {
	it("shows the files to commit at /code/changes, with Now selected and the way back to Code", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/code/changes");
		await screen.findByRole("heading", { name: "4 files to commit" });
		expect(screen.getByRole("form", { name: "Commit" })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe("/code/changes");
		const tabs = within(screen.getByRole("navigation", { name: "Tabs" }));
		expect(tabs.getByRole("link", { name: "Now" })).toHaveAttribute("aria-current", "page");
		await user.click(within(screen.getByRole("main")).getByRole("link", { name: "Code" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/now"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
