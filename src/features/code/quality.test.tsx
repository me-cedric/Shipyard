import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedPrs } from "@/lib/ipc/mock-code-prs";
import { ShellProvider } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { routers } from "@/test/routers";
import { Quality } from "./quality";

vi.mock("./use-file", () => ({
	useFile: () => ({
		data: {
			path: "src/config.ts",
			size: 9,
			binary: false,
			truncated: false,
			text: Array.from({ length: 45 }, (_, i) => `l${i + 1}`).join("\n"),
		},
	}),
}));

vi.mock("@xterm/xterm", () => ({
	Terminal: class {
		cols = 80;
		rows = 24;
		loadAddon() {}
		registerLinkProvider() {
			return { dispose() {} };
		}
		open() {}
		focus() {}
		write() {}
		onData() {
			return { dispose() {} };
		}
		onResize() {
			return { dispose() {} };
		}
		dispose() {}
	},
}));
vi.mock("@xterm/addon-fit", () => ({
	FitAddon: class {
		fit() {}
	},
}));

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const tile = (name: string) => screen.findByRole("group", { name });
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

describe("Flow / Health for every role (spec:app-redesign#REQ-023)", () => {
	afterEach(() => vi.restoreAllMocks());

	it("shows the gates with their state to a tester with no right on code, with each action off", async () => {
		const user = userEvent.setup();
		await open();
		// A finding with a file, and a check that failed for a missing program.
		await unwrap(commands.codeScanRun("secrets", true));
		const view = await unwrap(commands.codeQuality());
		const lint = view.checks[0];
		if (!lint) throw new Error("the demo has a check");
		vi.spyOn(commands, "codeQuality").mockResolvedValue({
			status: "ok",
			data: {
				...view,
				checks: [
					{
						...lint,
						name: "pnpm",
						label: null,
						last: {
							kind: "check",
							name: "pnpm",
							at: "2026-10-29T10:00:00Z",
							passed: false,
							durationMs: 60,
							tail: "",
							findings: [
								{
									severity: "high",
									path: "",
									line: null,
									message: "pnpm is not installed or not found",
								},
							],
						},
					},
					...view.checks,
				],
			} as never,
		});
		mockState().person = {
			member: "tess",
			found: "email",
			role: "qa",
			admin: false,
			readOnly: false,
			rights: [],
			access: {
				work: "read",
				specs: "read",
				design: "read",
				knowledge: "read",
				code: "none",
				runs: "none",
				settings: "none",
				costs: "none",
				merge: false,
				approve: false,
			},
		};
		// The view alone: the section gate of the shell is not the subject here.
		const router = createRouter({
			routeTree: createRootRoute({
				component: () => (
					<ShellProvider>
						<Quality />
					</ShellProvider>
				),
			}),
			history: createMemoryHistory({ initialEntries: ["/"] }),
		});
		routers().push(router as never);
		render(
			<Providers>
				<RouterProvider router={router as never} />
			</Providers>,
		);
		expect(await tile("Lint")).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/gates? needs? a fix/);
		const reason = "Needs the right runs.start (your role: Tester)";
		const run = within(await tile("Lint")).getByRole("button", { name: "Run Lint" });
		expect(run).toBeDisabled();
		expect(run).toHaveAccessibleDescription(reason);
		expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
		// The terminal, the installs and the file of a finding need a right on code.
		const write = "Needs the right code.write (your role: Tester)";
		const off = (name: string, why: string) => {
			const button = screen.getByRole("button", { name });
			expect(button).toBeDisabled();
			expect(button).toHaveAccessibleDescription(why);
		};
		await user.click(screen.getByRole("button", { name: "Open pnpm" }));
		off("Install pnpm", write);
		off("Open pnpm in terminal", write);
		await user.click(screen.getByRole("button", { name: "Set up the scanners" }));
		off("Install dependencies", write);
		await user.click(screen.getByRole("button", { name: "Open secrets" }));
		off("Open src/config.ts", "No access");
	});
});

describe("Flow / Health", () => {
	it("shows one grid of tiles for the checks and the scanners, the failing ones first, with no command", async () => {
		await open();
		await unwrap(commands.codeScanRun("secrets", true));
		const router = mountApp("/flow/health");
		await tile("secrets");
		// Each kind is a named group with its count inside the one grid.
		const checks = screen.getByRole("group", { name: "Checks (4)" });
		const scanners = screen.getByRole("group", { name: "Scanners (4)" });
		const tilesOf = (g: HTMLElement) =>
			within(g)
				.getAllByRole("heading", { level: 3 })
				.map((h) => h.textContent);
		expect(tilesOf(checks)).toEqual(expect.arrayContaining(["Lint", "Tests"]));
		expect(tilesOf(checks)).toHaveLength(4);
		expect(tilesOf(scanners)).toEqual(expect.arrayContaining(["secrets", "dependencies"]));
		expect(tilesOf(scanners)).toHaveLength(4);
		// The failing ones come first in the grid, whatever the kind: the tile of secrets has the first place.
		expect(within(scanners).getByRole("group", { name: "secrets" })).toHaveStyle({ order: "0" });
		// The attention card names the failing gate and opens its findings.
		expect(screen.getByRole("heading", { name: "Needs a fix: secrets, Docs" })).toBeVisible();
		expect(screen.getAllByText("Not installed")).toHaveLength(3);
		// A scanner that the app does not ship has no run action.
		expect(screen.queryByRole("button", { name: "Run dependencies" })).toBeNull();
		// The card of the commands has its title and Edit, and the command shows on no tile.
		const commandsCard = screen.getByRole("region", { name: "Commands of the gates" });
		expect(within(commandsCard).getByRole("button", { name: "Edit" })).toBeVisible();
		expect(within(await tile("Lint")).queryByText("pnpm run lint")).toBeNull();
		// The last report of a gate shows its duration in the panel of the gate.
		await userEvent.click(within(await tile("Tests")).getByRole("button", { name: "Open Tests" }));
		expect(await screen.findByText(/5.2 s/)).toBeVisible();
		await idle(router);
	});

	it("opens the findings of the failing gate from the attention card", async () => {
		const user = userEvent.setup();
		await open();
		await unwrap(commands.codeScanRun("secrets", true));
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Show the findings" }));
		expect(await screen.findByText("High: GitHub token")).toBeVisible();
		await idle(router);
	});

	it("shows the coverage of the report that the project produced in the security score", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Security score" }));
		const stat = await screen.findByText("Coverage");
		expect(stat.parentElement).toHaveTextContent("82%");
		await idle(router);
	});

	it("verifies all docs after a confirmation and lists each problem with its place", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Run Verify all docs" }));
		await user.click(screen.getByRole("button", { name: "Run Verify all docs?" }));
		await waitFor(() => expect(screen.getAllByRole("img", { name: "Warnings" })).toHaveLength(1));
		expect(screen.queryByRole("img", { name: "Failed" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "Open Verify all docs" }));
		expect(screen.getByText("Medium: broken link: gone.md")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open docs/handbook/start.md" })).toBeInTheDocument();
		expect(screen.getByText("3 changes, 12 pages, 1 problems")).toBeInTheDocument();
		await idle(router);
	});

	it("installs a missing scanner from the scanner set-up and then offers to run it", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Set up the scanners" }));
		await user.click(await screen.findByRole("button", { name: "Install dependencies" }));
		expect(await screen.findByRole("button", { name: "Run dependencies" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Install dependencies" })).toBeNull();
		// The two other scanners stay uninstalled: a tile and a row of the set-up for each.
		expect(screen.getAllByText("Not installed")).toHaveLength(4);
		await idle(router);
	});

	it("runs a check only after a confirmation that names it and its exact command", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Run Lint" }));
		expect(screen.getAllByRole("img", { name: "Pass" })).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "Run Lint (pnpm run lint)?" }));
		await user.click(await screen.findByRole("button", { name: "Open Lint" }));
		await waitFor(() => expect(screen.getByText(/1.8 s/)).toBeInTheDocument());
		expect(screen.getAllByRole("img", { name: "Pass" })).toHaveLength(2);
		await idle(router);
	});

	it("runs all the gates after one confirmation", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Run all" }));
		await user.click(screen.getByRole("button", { name: /^Run all \d+ gates\?$/ }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Run all" })).toBeVisible());
		expect(screen.queryByRole("img", { name: "Never run" })).toBeNull();
		await idle(router);
	});

	it("shows a finding with its severity shape and path, and opens it in the viewer", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Run secrets" }));
		await user.click(screen.getByRole("button", { name: "Run secrets?" }));
		await user.click(await screen.findByRole("button", { name: "Open secrets" }));
		expect(screen.getByText("High: GitHub token")).toBeInTheDocument();
		expect(screen.getAllByRole("img", { name: "Failed" })).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "Open src/config.ts" }));
		expect(await screen.findByRole("region", { name: "File src/config.ts" })).toBeInTheDocument();
		expect(document.querySelector("[data-marked]")).toHaveTextContent("40");
		await idle(router);
	});

	it("shows a security score from the last scans and exports the SBOM after a click", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Security score" }));
		const panel = await screen.findByRole("region", { name: "Security score" });
		// The stat item (after the panel title) holds the value.
		const score = () => within(panel).getAllByText("Security score").at(-1)?.parentElement;
		expect(score()).toHaveTextContent("-");
		await user.click(screen.getByRole("button", { name: "Run secrets" }));
		await user.click(screen.getByRole("button", { name: "Run secrets?" }));
		// One high finding costs 10 points.
		await waitFor(() => expect(score()).toHaveTextContent("90"));
		await user.click(screen.getByRole("button", { name: "Export the list of parts (SBOM)" }));
		await user.click(
			await screen.findByRole("button", { name: "Export the list of software parts" }),
		);
		expect(
			await screen.findByText("312 components in docs/security/sbom.cdx.json"),
		).toBeInTheDocument();
		await idle(router);
	});

	it("sets up the checks: edits the proposal, saves it and shows why a check failed", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Edit" }));
		const list = await screen.findByRole("textbox", { name: "Commands" });
		await waitFor(() => expect(list).toHaveValue("pnpm run lint\npnpm run test\ncargo test"));
		await user.clear(list);
		await user.type(list, "make ci");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(screen.queryByRole("textbox", { name: "Commands" })).toBeNull());
		// The check "make ci" and the two docs checks stay: three checks and four scanners.
		await waitFor(() => {
			const group = screen.getByRole("group", { name: "Checks (3)" });
			const names = within(group)
				.getAllByRole("heading", { level: 3 })
				.map((h) => h.textContent);
			expect(names).toEqual(expect.arrayContaining(["make ci", "Verify all docs", "Docs"]));
			expect(names).toHaveLength(3);
			expect(screen.getByRole("group", { name: "Scanners (4)" })).toBeVisible();
		});
		await user.click(await screen.findByRole("button", { name: "Run make ci" }));
		await user.click(screen.getByRole("button", { name: "Run make ci?" }));
		await user.click(await screen.findByRole("button", { name: "Open make ci" }));
		expect(screen.getByText("`make ci` stopped with exit code 1")).toBeInTheDocument();
		expect(screen.getByText("boom")).toBeInTheDocument();
		await idle(router);
	});

	it("names the missing program of a failed check and offers to install it", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Edit" }));
		const list = await screen.findByRole("textbox", { name: "Commands" });
		await waitFor(() => expect(list).not.toHaveValue(""));
		await user.clear(list);
		await user.type(list, "pnpm");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await user.click(await screen.findByRole("button", { name: "Run pnpm" }));
		await user.click(screen.getByRole("button", { name: "Run pnpm?" }));
		await user.click(await screen.findByRole("button", { name: "Open pnpm" }));
		expect(screen.getByText("pnpm is not installed or not found")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Install pnpm" })).toBeInTheDocument();
		await idle(router);
	});

	it("runs the Docs check after a confirmation, shows the count of stale docs and keeps the report", async () => {
		const user = userEvent.setup();
		await open();
		// Start with no Docs report: only the run can write it.
		const seeded = seedPrs();
		seeded.reports = seeded.reports.filter((r) => r.name !== "docs freshness");
		mockState().prs = seeded;
		const router = mountApp("/flow/health");
		expect(await tile("Docs")).toBeVisible();
		expect(within(await tile("Docs")).queryByText(/stale docs/)).toBeNull();
		await user.click(screen.getByRole("button", { name: "Run Docs" }));
		await user.click(screen.getByRole("button", { name: "Run Docs?" }));
		expect(await within(await tile("Docs")).findByText(/2 stale docs/)).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Open Docs" }));
		expect(screen.getByText("Medium: stale: crates/app/Cargo.toml changed")).toBeInTheDocument();
		// The report stays after the view closes and opens again.
		await idle(router);
		cleanup();
		const again = mountApp("/flow/health");
		expect(await within(await tile("Docs")).findByText(/2 stale docs/)).toBeInTheDocument();
		await idle(again);
	});

	it("explains a check and a scanner in an info popover", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "About Lint" }));
		expect(await screen.findByText(/Biome/)).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "About secrets" }));
		expect(await screen.findByText(/shipyard:allow-secret/)).toBeInTheDocument();
		await idle(router);
	});

	it("shows Running, a counting time and the output lines, and keeps Run off until the end", async () => {
		const user = userEvent.setup();
		let end: (r: unknown) => void = () => {};
		const real = commands.codeCheckRun;
		vi.spyOn(commands, "codeCheckRun").mockImplementation((c, k) =>
			new Promise((resolve) => (end = (r) => resolve(r as never))).then(() => real(c, k)),
		);
		await open();
		const router = mountApp("/flow/health");
		await user.click(await screen.findByRole("button", { name: "Run Lint" }));
		await user.click(screen.getByRole("button", { name: "Run Lint (pnpm run lint)?" }));
		const lint = await tile("Lint");
		expect(await within(lint).findByRole("img", { name: "Running" })).toBeInTheDocument();
		expect(within(lint).getByText(/^00:0\d$/)).toBeInTheDocument();
		expect(within(lint).getByRole("button", { name: "Output of Lint" })).toBeInTheDocument();
		expect(within(lint).getByRole("button", { name: "Run Lint" })).toBeDisabled();
		end(null);
		await waitFor(() => expect(within(lint).queryByRole("img", { name: "Running" })).toBeNull());
		await user.click(within(lint).getByRole("button", { name: "Open Lint" }));
		expect(
			within(await screen.findByRole("region", { name: "Lint" })).getByRole("button", {
				name: "Run Lint",
			}),
		).toBeEnabled();
		vi.restoreAllMocks();
		await idle(router);
	});

	it("opens the command of a check or a scanner in the terminal, and not of a built-in check", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/health");
		const write = vi.spyOn(commands, "terminalWrite");
		await user.click(await screen.findByRole("button", { name: "Run Lint" }));
		await user.click(screen.getByRole("button", { name: "Run Lint (pnpm run lint)?" }));
		await user.click(await screen.findByRole("button", { name: "Open Lint" }));
		await user.click(await screen.findByRole("button", { name: "Open Lint in terminal" }));
		await waitFor(() => expect(write).toHaveBeenCalledWith(expect.any(String), "pnpm run lint\r"));
		write.mockRestore();
		// A scanner that runs a program offers the terminal too.
		await user.click(await screen.findByRole("button", { name: "Set up the scanners" }));
		await user.click(await screen.findByRole("button", { name: "Install dependencies" }));
		await user.click(await screen.findByRole("button", { name: "Run dependencies" }));
		await user.click(screen.getByRole("button", { name: "Run dependencies?" }));
		await user.click(await screen.findByRole("button", { name: "Open dependencies" }));
		expect(
			await screen.findByRole("button", { name: "Open dependencies in terminal" }),
		).toBeInTheDocument();
		// A gate with no command of its own has no terminal button: check it in its own open panel.
		for (const name of ["secrets", "Verify all docs", "Docs"]) {
			if (name !== "Docs") {
				await user.click(await screen.findByRole("button", { name: `Run ${name}` }));
				await user.click(screen.getByRole("button", { name: `Run ${name}?` }));
			}
			await user.click(await screen.findByRole("button", { name: `Open ${name}` }));
			expect(await screen.findByRole("region", { name })).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: `Open ${name} in terminal` })).toBeNull();
		}
		await idle(router);
	});
});
