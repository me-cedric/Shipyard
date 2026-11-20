import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { routers } from "@/test/routers";
import { FindingsOverTime } from "./doctor-ledger";

describe("Settings / Health / tools and ledger", () => {
	it("lists the tools by group, installs a missing one after a click, and records the change", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		// The tools are of this computer. The ledger of the project counts each finding.
		mountApp("/setup/computer?page=health");
		const base = await screen.findByRole("region", { name: "Base" });
		expect(within(base).getByText("git version 2.46.0")).toBeInTheDocument();
		expect(within(base).getByText("pnpm")).toBeInTheDocument();
		for (const name of ["Code hosts", "Agents", "Scanners"])
			expect(screen.getByRole("region", { name })).toBeInTheDocument();
		// A tool with no package manager has no install button.
		expect(screen.queryByRole("button", { name: "Install skillspector" })).not.toBeInTheDocument();

		await user.click(within(base).getByRole("button", { name: "Install pnpm" }));
		await waitFor(() =>
			expect(mockState().doctor.tools.find((t) => t.id === "pnpm")?.installed).toBe(true),
		);
		expect(within(base).queryByRole("button", { name: "Install pnpm" })).not.toBeInTheDocument();
	});

	it("shows the ledger as a card, newest first", async () => {
		const before = mockState().doctor.ledger.length;
		await unwrap(commands.doctorToolInstall("pnpm", true));
		const router = createRouter({
			routeTree: createRootRoute({ component: FindingsOverTime }),
			history: createMemoryHistory({ initialEntries: ["/"] }),
		});
		routers().push(router as never);
		render(
			<Providers>
				<RouterProvider router={router as never} />
			</Providers>,
		);
		const ledger = await screen.findByRole("region", { name: "Findings over time" });
		// Reading the ledger records the change.
		await waitFor(() => expect(mockState().doctor.ledger.length).toBe(before + 1));
		await waitFor(async () =>
			expect((await within(ledger).findAllByText("-1 fixed"))[0]).toBeInTheDocument(),
		);
		// The pills follow the date in a row, and no visible total is drawn.
		const row = within(ledger).getAllByText("-1 fixed")[0]?.parentElement as HTMLElement;
		expect(row.firstElementChild?.tagName).toBe("TIME");
		expect(within(row).getByText(/^\d+$/)).toHaveClass("sr-only");
	});

	it("an unknown tool and a tool with no installer fail with a reason", async () => {
		await expect(unwrap(commands.doctorToolInstall("nope", true))).rejects.toMatchObject({
			details: expect.stringContaining("unknown tool"),
		});
		await expect(unwrap(commands.doctorToolInstall("skillspector", true))).rejects.toMatchObject({
			details: expect.stringContaining("no package manager"),
		});
		await expect(unwrap(commands.doctorToolInstall("pnpm", false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
	});
});
