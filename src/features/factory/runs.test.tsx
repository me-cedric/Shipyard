import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider, useShell } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { Runs } from "./index";

const LANES = [
	["queued", "Queued"],
	["working", "Working"],
	["needs_you", "Needs you"],
	["in_review", "In review"],
	["ready_to_merge", "Ready to merge"],
	["done", "Done"],
] as const;

/** Stands in for the inspector of the shell. */
function Panel() {
	const { detail } = useShell();
	return <aside aria-label="panel">{detail?.node}</aside>;
}

async function renderRuns() {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	return renderApp(
		<ShellProvider>
			<Runs />
			<Panel />
		</ShellProvider>,
	);
}
const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

describe("Factory / Runs", () => {
	// jsdom has no matchMedia: the graph reads the colour scheme.
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
		})) as typeof window.matchMedia;
	});

	it("shows six lanes with a count each, from the mock dataset", async () => {
		await renderRuns();
		const runs = await unwrap(commands.runsList());
		for (const [lane, name] of LANES) {
			const n = runs.filter((r) => r.lane === lane).length;
			expect(await screen.findByRole("heading", { name: `${name} (${n})` })).toBeInTheDocument();
		}
		expect(runs).toHaveLength(14);
	});

	it("shows the kill switch state", async () => {
		await renderRuns();
		expect(await screen.findByText("Kill switch off")).toBeInTheDocument();
	});

	it("starts a run from a ticket key, and the Queued count grows", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		const before = (await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length;
		await user.type(await screen.findByRole("textbox", { name: "Ticket" }), "ACME-3");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		await waitFor(async () =>
			expect((await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length).toBe(
				before + 1,
			),
		);
	});

	it("opens the run view with the keyboard: graph nodes, events, diff, cost", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const run = await find("ACME-2");
		const card = await screen.findByRole("button", { name: /ACME-2/ });
		card.focus();
		await user.keyboard("{Enter}");
		const panel = await screen.findByRole("complementary", { name: "panel" });
		const graph = await within(panel).findByRole("region", { name: "Workflow" });
		// jsdom measures no node, so xyflow keeps each one hidden.
		const node = (id: string) => within(graph).findByTestId(`rf__node-${id}`);
		for (const s of run.steps) expect(await node(s.id)).toBeInTheDocument();
		const build = within(await node("build"));
		expect(build.getByText("Units 4")).toBeInTheDocument();
		expect(await within(panel).findByRole("region", { name: /^Events/ })).toBeInTheDocument();
		await waitFor(() => expect(within(panel).getAllByRole("listitem").length).toBeGreaterThan(0));
		expect(await within(panel).findByRole("region", { name: "Diff" })).toBeInTheDocument();
		expect(within(panel).getByText("$1.84")).toBeInTheDocument();
	});

	it("kills a run with runCancel", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-2/ }));
		const panel = await screen.findByRole("complementary", { name: "panel" });
		await user.click(await within(panel).findByRole("button", { name: "Kill run" }));
		await waitFor(async () => expect((await find("ACME-2")).state).toBe("Cancelled"));
	});

	it("unblocks and resumes from the run view", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const panel = await screen.findByRole("complementary", { name: "panel" });
		for (const [key, button, to] of [
			["ACME-9", "Unblock", "Working"],
			["ACME-6", "Resume", "Working"],
		] as const) {
			await user.click(await screen.findByRole("button", { name: new RegExp(key) }));
			if (button === "Resume")
				await user.type(
					await within(panel).findByRole("textbox", { name: "Added budget (USD)" }),
					"2",
				);
			await user.click(await within(panel).findByRole("button", { name: button }));
			await waitFor(async () => expect((await find(key)).state).toBe(to));
		}
	});
});
