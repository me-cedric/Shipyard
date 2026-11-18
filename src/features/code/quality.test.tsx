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
const group = (name: string) => screen.findByRole("region", { name });

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
		const checks = await group("Checks");
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/gates? needs? a fix/);
		expect(within(checks).getByRole("heading", { name: "Lint" })).toBeInTheDocument();
		expect(within(checks).getByRole("img", { name: "Passed" })).toBeInTheDocument();
		expect(await group("Scanners")).toBeInTheDocument();
		const reason = "Needs the right runs.start (your role: Tester)";
		const run = within(checks).getByRole("button", { name: "Run Lint" });
		expect(run).toBeDisabled();
		expect(run).toHaveAccessibleDescription(reason);
		expect(screen.getByRole("button", { name: "Set up checks" })).toBeDisabled();
		// The terminal, the installs and the file of a finding need a right on code.
		const write = "Needs the right code.write (your role: Tester)";
		const off = (name: string, why: string) => {
			const button = screen.getByRole("button", { name });
			expect(button).toBeDisabled();
			expect(button).toHaveAccessibleDescription(why);
		};
		off("Open Lint in terminal", write);
		off("Install dependencies", write);
		await user.click(within(checks).getAllByRole("button", { name: "Findings" })[0] as HTMLElement);
		off("Install pnpm", write);
		await user.click(within(await group("Scanners")).getByRole("button", { name: "Findings" }));
		off("Open src/config.ts", "No access");
	});
});

describe("Code / Quality", () => {
	it("lists the declared checks and the scanners with counts and the last report", async () => {
		await open();
		mountApp("/code/quality");
		const checks = await group("Checks");
		expect(screen.getByRole("heading", { name: "Checks (4)" })).toBeInTheDocument();
		expect(within(checks).getByRole("heading", { name: "Lint" })).toBeInTheDocument();
		expect(within(checks).getByText("pnpm run lint")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Scanners (4)" })).toBeInTheDocument();
		expect(within(checks).getByRole("img", { name: "Passed" })).toBeInTheDocument();
		expect(within(checks).getByText(/5.2 s/)).toBeInTheDocument();
		expect(screen.getAllByText("Not installed")).toHaveLength(3);
		// A scanner that the app does not ship has no run action.
		expect(screen.queryByRole("button", { name: "Run dependencies" })).toBeNull();
	});

	it("shows the coverage of the report that the project produced", async () => {
		await open();
		mountApp("/code/quality");
		const stat = await screen.findByText("Coverage");
		expect(stat.parentElement).toHaveTextContent("82%");
	});

	it("verifies all docs after a confirmation and lists each problem with its place", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Run Verify all docs" }));
		await user.click(screen.getByRole("button", { name: "Run Verify all docs?" }));
		const checks = await group("Checks");
		await waitFor(() =>
			expect(within(checks).getAllByRole("img", { name: "Warnings" })).toHaveLength(1),
		);
		expect(within(checks).queryByRole("img", { name: "Failed" })).toBeNull();
		await user.click(
			within(checks).getAllByRole("button", { name: "Findings" }).at(-1) as HTMLElement,
		);
		expect(screen.getByText("Medium: broken link: gone.md")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open docs/handbook/start.md" })).toBeInTheDocument();
		expect(within(checks).getByText("3 changes, 12 pages, 1 problems")).toBeInTheDocument();
	});

	it("installs a missing scanner with one click and then offers to run it", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Install dependencies" }));
		expect(await screen.findByRole("button", { name: "Run dependencies" })).toBeInTheDocument();
		expect(screen.getAllByText("Not installed")).toHaveLength(2);
	});

	it("runs a check only after a confirmation that names it and its exact command", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Run Lint" }));
		expect(screen.getAllByRole("img", { name: "Passed" })).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "Run Lint (pnpm run lint)?" }));
		await waitFor(() => expect(screen.getByText(/1.8 s/)).toBeInTheDocument());
		expect(screen.getAllByRole("img", { name: "Passed" })).toHaveLength(2);
	});

	it("shows a finding with its severity shape and path, and opens it in the viewer", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Run secrets" }));
		await user.click(screen.getByRole("button", { name: "Run secrets?" }));
		const scanners = await group("Scanners");
		await user.click(await within(scanners).findByRole("button", { name: "Findings" }));
		expect(screen.getByText("High: GitHub token")).toBeInTheDocument();
		expect(within(scanners).getAllByRole("img", { name: "Failed" })).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "Open src/config.ts" }));
		expect(await screen.findByRole("region", { name: "File src/config.ts" })).toBeInTheDocument();
		expect(document.querySelector("[data-marked]")).toHaveTextContent("40");
	});

	it("shows a security score from the last scans and exports the SBOM after a click", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		const score = await screen.findByText("Security score");
		expect(score.parentElement).toHaveTextContent("-");
		await user.click(screen.getByRole("button", { name: "Run secrets" }));
		await user.click(screen.getByRole("button", { name: "Run secrets?" }));
		// One high finding costs 10 points.
		await waitFor(() =>
			expect(screen.getByText("Security score").parentElement).toHaveTextContent("90"),
		);
		await user.click(screen.getByRole("button", { name: "Export the list of software parts" }));
		expect(
			await screen.findByText("312 components in docs/security/sbom.cdx.json"),
		).toBeInTheDocument();
	});

	it("sets up the checks: edits the proposal, saves it and shows why a check failed", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Set up checks" }));
		const list = await screen.findByRole("textbox", { name: "Commands" });
		await waitFor(() => expect(list).toHaveValue("pnpm run lint\npnpm run test\ncargo test"));
		await user.clear(list);
		await user.type(list, "make ci");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const checks = await group("Checks");
		await waitFor(() => expect(within(checks).getByText("make ci")).toBeInTheDocument());
		expect(screen.queryByRole("textbox", { name: "Commands" })).toBeNull();
		expect(screen.getByRole("heading", { name: "Checks (3)" })).toBeInTheDocument();
		await user.click(within(checks).getByRole("button", { name: "Run make ci" }));
		await user.click(within(checks).getByRole("button", { name: "Run make ci?" }));
		const findings = await within(checks).findAllByRole("button", { name: "Findings" });
		await user.click(findings[0] as HTMLElement);
		expect(screen.getByText("`make ci` stopped with exit code 1")).toBeInTheDocument();
		expect(screen.getByText("boom")).toBeInTheDocument();
	});

	it("names the missing program of a failed check and offers to install it", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Set up checks" }));
		const list = await screen.findByRole("textbox", { name: "Commands" });
		await waitFor(() => expect(list).not.toHaveValue(""));
		await user.clear(list);
		await user.type(list, "pnpm");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await user.click(await screen.findByRole("button", { name: "Run pnpm" }));
		await user.click(screen.getByRole("button", { name: "Run pnpm?" }));
		const findings = await screen.findAllByRole("button", { name: "Findings" });
		await user.click(findings[0] as HTMLElement);
		expect(screen.getByText("pnpm is not installed or not found")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Install pnpm" })).toBeInTheDocument();
	});

	it("runs the Docs check after a confirmation, shows the count of stale docs and keeps the report", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Run Docs" }));
		await user.click(screen.getByRole("button", { name: "Run Docs?" }));
		const checks = await group("Checks");
		expect(await within(checks).findByText(/2 stale docs/)).toBeInTheDocument();
		await user.click(
			within(checks).getAllByRole("button", { name: "Findings" }).at(-1) as HTMLElement,
		);
		expect(screen.getByText("Medium: stale: crates/app/Cargo.toml changed")).toBeInTheDocument();
		// The report stays after the view closes and opens again.
		cleanup();
		mountApp("/code/quality");
		expect(await within(await group("Checks")).findByText(/2 stale docs/)).toBeInTheDocument();
	});

	it("explains a check and a scanner in an info popover", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "About Lint" }));
		expect(await screen.findByText(/Biome/)).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "About secrets" }));
		expect(await screen.findByText(/shipyard:allow-secret/)).toBeInTheDocument();
	});

	it("shows Running, a counting time and the output lines, and keeps Run off until the end", async () => {
		const user = userEvent.setup();
		let end: (r: unknown) => void = () => {};
		const real = commands.codeCheckRun;
		vi.spyOn(commands, "codeCheckRun").mockImplementation((c, k) =>
			new Promise((resolve) => (end = (r) => resolve(r as never))).then(() => real(c, k)),
		);
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Run Lint" }));
		await user.click(screen.getByRole("button", { name: "Run Lint (pnpm run lint)?" }));
		const checks = await group("Checks");
		expect(await within(checks).findByRole("img", { name: "Running" })).toBeInTheDocument();
		expect(within(checks).getByText(/^00:0\d$/)).toBeInTheDocument();
		expect(within(checks).getByRole("button", { name: "Output of Lint" })).toBeInTheDocument();
		expect(within(checks).getByRole("button", { name: "Run Lint" })).toBeDisabled();
		end(null);
		await waitFor(() => expect(within(checks).queryByRole("img", { name: "Running" })).toBeNull());
		expect(within(checks).getByRole("button", { name: "Run Lint" })).toBeEnabled();
		vi.restoreAllMocks();
	});

	it("opens the command of a check or a scanner in the terminal, and not of a built-in check", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		const write = vi.spyOn(commands, "terminalWrite");
		await user.click(await screen.findByRole("button", { name: "Open Lint in terminal" }));
		await waitFor(() => expect(write).toHaveBeenCalledWith(expect.any(String), "pnpm run lint\r"));
		write.mockRestore();
		expect(screen.queryByRole("button", { name: "Open secrets in terminal" })).toBeNull();
		expect(
			screen.getByRole("button", { name: "Open dependencies in terminal" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Open (Verify all docs|Docs) in terminal/ }),
		).toBeNull();
	});
});
