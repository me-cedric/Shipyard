import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Health / tools and ledger", () => {
	it("lists the tools by group, installs a missing one after a click, and records the change", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/settings/health");
		const base = await screen.findByRole("region", { name: "Base" });
		expect(within(base).getByText("git version 2.46.0")).toBeInTheDocument();
		expect(within(base).getByText("pnpm")).toBeInTheDocument();
		for (const name of ["Forges", "Agents", "Scanners"])
			expect(screen.getByRole("region", { name })).toBeInTheDocument();
		// A tool with no package manager has no install button.
		expect(screen.queryByRole("button", { name: "Install skillspector" })).not.toBeInTheDocument();

		const ledger = await screen.findByRole("region", { name: "Findings over time" });
		const before = mockState().doctor.ledger.length;
		await user.click(within(base).getByRole("button", { name: "Install pnpm" }));
		await waitFor(() =>
			expect(mockState().doctor.tools.find((t) => t.id === "pnpm")?.installed).toBe(true),
		);
		expect(within(base).queryByRole("button", { name: "Install pnpm" })).not.toBeInTheDocument();
		await waitFor(() => expect(mockState().doctor.ledger.length).toBe(before + 1));
		const newest = (await within(ledger).findAllByText("-1 fixed"))[0];
		expect(newest).toBeInTheDocument();
	});

	it("an unknown tool and a tool with no installer fail with a reason", async () => {
		await expect(unwrap(commands.doctorToolInstall("nope"))).rejects.toThrow("unknown tool");
		await expect(unwrap(commands.doctorToolInstall("skillspector"))).rejects.toThrow(
			"no package manager",
		);
	});
});
