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
		const title = await screen.findByRole("heading", { level: 1, name: /^\d+ problems?$/ });
		const before = Number(/^\d+/.exec(title.textContent ?? "")?.[0]);
		expect(before).toBeGreaterThan(0);
		expect(screen.queryByText("Nothing to fix")).not.toBeInTheDocument();
		const banner = await screen.findByRole("region", {
			name: "pnpm is not installed on this computer",
		});
		expect(within(banner).getByRole("link", { name: "Details" })).toBeInTheDocument();
		await user.click(within(banner).getByRole("button", { name: "Fix it" }));
		await waitFor(() =>
			expect(mockState().doctor.tools.find((t) => t.id === "pnpm")?.installed).toBe(true),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("region", { name: "pnpm is not installed on this computer" }),
			).toBeNull(),
		);
		// The install takes one problem away from the title.
		const after = before - 1;
		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: after === 0 ? "No problem" : after === 1 ? "1 problem" : `${after} problems`,
			}),
		).toBeInTheDocument();
	});

	it("counts every problem that the tiles name, and a tile to fix has no check icon", async () => {
		mountApp("/setup/computer?page=health");
		const first = await screen.findByRole("link", { name: /^First setup/ });
		await waitFor(() => expect(first).toHaveTextContent(/\d+ to fix/));
		const tiles = ["Tools", "Skills", "First setup"].map((n) =>
			screen.getByRole("link", { name: new RegExp(`^${n}`) }),
		);
		let sum = 0;
		for (const tile of tiles) {
			const n = Number(/(\d+) (to fix|missing)/.exec(tile.textContent ?? "")?.[1] ?? 0);
			sum += n;
			// A tile to fix shows the warning shape, not the check shape.
			if (n) expect(tile.querySelector("path")?.getAttribute("d")).toMatch(/^M12 3l9 16/);
		}
		const title = screen.getByRole("heading", { name: /problem/ }).textContent ?? "";
		expect(Number(/(\d+)/.exec(title)?.[1] ?? (sum ? 1 : 0))).toBeGreaterThanOrEqual(sum);
		expect(sum).toBeGreaterThan(0);
	});

	it("shows the five areas, and the cards of the version and the help", async () => {
		mountApp("/setup/computer?page=health");
		for (const name of ["Tools", "Skills", "First setup", "Ledger", "Console"])
			expect(await screen.findByRole("link", { name: new RegExp(`^${name}`) })).toBeInTheDocument();
		for (const name of ["Check for an update", "Send feedback", "Shortcuts", "Manual"])
			expect(screen.getByRole("button", { name })).toBeInTheDocument();
		expect(screen.getAllByRole("link", { name: "Logs and feedback" }).length).toBeGreaterThan(0);
	});

	it("counts the open first-setup items instead of saying Done", async () => {
		mountApp("/setup/computer?page=health");
		const area = await screen.findByRole("link", { name: /^First setup/ });
		await waitFor(() => expect(area).toHaveTextContent(/\d+ to fix/));
		expect(area).not.toHaveTextContent("Done");
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
