import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Setup / Health", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("counts a missing required tool as a problem, with a banner and a fix", async () => {
		const user = userEvent.setup();
		mountApp("/setup/computer?page=health");
		// DEFECT: the page said "Nothing to fix" while pnpm was missing.
		expect(await screen.findByRole("heading", { name: "1 problem" })).toBeInTheDocument();
		expect(screen.queryByText("Nothing to fix")).not.toBeInTheDocument();
		const banner = await screen.findByRole("region", { name: "pnpm is missing on this machine" });
		expect(within(banner).getByRole("link", { name: "Details" })).toBeInTheDocument();
		await user.click(within(banner).getByRole("button", { name: "Fix it" }));
		await waitFor(() =>
			expect(mockState().doctor.tools.find((t) => t.id === "pnpm")?.installed).toBe(true),
		);
		expect(await screen.findByRole("heading", { name: "No problem" })).toBeInTheDocument();
	});

	it("shows the five areas, and the cards of the version and the help", async () => {
		mountApp("/setup/computer?page=health");
		for (const name of ["Tools", "Skills", "First setup", "Ledger", "Console"])
			expect(await screen.findByRole("link", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
		for (const name of ["Check for an update", "Send feedback", "Shortcuts", "Manual"])
			expect(screen.getByRole("button", { name })).toBeInTheDocument();
		expect(screen.getAllByRole("link", { name: "Logs and feedback" }).length).toBeGreaterThan(0);
	});

	it("says what is to fix in the project, with the two actions at the heading", async () => {
		mountApp("/setup/project?page=health");
		expect(await screen.findByRole("heading", { name: /in this project$/ })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
		const also = screen.getByRole("region", { name: "Also" });
		expect(within(also).getByRole("link", { name: "Health of this computer" })).toBeInTheDocument();
		expect(within(also).getByRole("link", { name: "Health of the product" })).toBeInTheDocument();
	});
});
