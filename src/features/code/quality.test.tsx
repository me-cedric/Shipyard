import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

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

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const group = (name: string) => screen.findByRole("region", { name });

describe("Code / Quality", () => {
	it("lists the declared checks and the scanners with counts and the last report", async () => {
		await open();
		mountApp("/code/quality");
		const checks = await group("Checks");
		expect(screen.getByRole("heading", { name: "Checks (3)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Scanners (4)" })).toBeInTheDocument();
		expect(within(checks).getByRole("img", { name: "Passed" })).toBeInTheDocument();
		expect(within(checks).getByText(/5200 ms/)).toBeInTheDocument();
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
			expect(within(checks).getAllByRole("img", { name: "Failed" })).toHaveLength(1),
		);
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

	it("runs a check only after a confirmation that names it", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/quality");
		await user.click(await screen.findByRole("button", { name: "Run pnpm lint" }));
		expect(screen.getAllByRole("img", { name: "Passed" })).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "Run pnpm lint?" }));
		await waitFor(() => expect(screen.getByText(/1800 ms/)).toBeInTheDocument());
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
		await user.click(screen.getByRole("button", { name: "Export SBOM" }));
		expect(
			await screen.findByText("312 components in docs/security/sbom.cdx.json"),
		).toBeInTheDocument();
	});
});
