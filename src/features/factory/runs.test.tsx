import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { latestPerTicket } from "@/lib/home";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
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

async function renderRuns() {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	return renderApp(
		<ShellProvider>
			<Runs />
		</ShellProvider>,
	);
}
const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

describe("Factory / Runs", () => {
	// jsdom has no matchMedia: the graph reads the colour scheme and the motion preference.
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("shows six lanes with a count each, from the mock dataset", async () => {
		await renderRuns();
		const all = await unwrap(commands.runsList());
		const runs = latestPerTicket(all);
		for (const [lane, name] of LANES) {
			const n = runs.filter((r) => r.lane === lane).length;
			expect(await screen.findByRole("heading", { name: `${name} (${n})` })).toBeInTheDocument();
		}
		expect(all).toHaveLength(14);
	});

	it("shows the plan and its tasks on a run in plan review", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-4/ }));
		const plan = await screen.findByRole("region", { name: "Plan" });
		expect(within(plan).getByText(/Add the export button\./)).toBeInTheDocument();
		expect(within(plan).getByText("Add it to the toolbar.")).toBeInTheDocument();
	});

	it("hides a run that a newer run of its ticket replaces", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.syncItems({}));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await unwrap(commands.runStart("ACME-3"));
		await renderRuns();
		const all = await unwrap(commands.runsList());
		const runs = latestPerTicket(all);
		expect(runs.length).toBeLessThan(all.length);
		for (const [lane, name] of LANES) {
			const n = runs.filter((r) => r.lane === lane).length;
			expect(await screen.findByRole("heading", { name: `${name} (${n})` })).toBeInTheDocument();
		}
	});

	it("shows the kill switch as an agents toggle", async () => {
		await renderRuns();
		expect(await screen.findByRole("switch", { name: "Agents on" })).toBeChecked();
	});

	it("starts a run from the title of a ticket of the mirror", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await renderRuns();
		const title = (await unwrap(commands.syncItems({}))).find((i) => i.key === "ACME-3")?.title;
		const before = (await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length;
		const field = await screen.findByRole("combobox", { name: "Ticket" });
		await waitFor(() =>
			expect(document.querySelector(`datalist option[value="${title}"]`)).not.toBeNull(),
		);
		await user.type(field, title ?? "");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		await waitFor(async () =>
			expect((await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length).toBe(
				before + 1,
			),
		);
	});

	it("leaves a ticket with a run out of the list, and links the refusal to the run", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await renderRuns();
		const field = await screen.findByRole("combobox", { name: "Ticket" });
		// ACME-3 has no live run now: it is in the list. ACME-2 works: it is not.
		await waitFor(() =>
			expect(document.querySelector('datalist option[label="ACME-3"]')).not.toBeNull(),
		);
		expect(document.querySelector('datalist option[label="ACME-2"]')).toBeNull();
		await user.type(field, "ACME-2");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("A run is active on ACME-2.");
		await user.click(within(alert).getByRole("button", { name: "Open the run" }));
		const drawer = await screen.findByRole("complementary", { name: "ACME-2" });
		// The drawer fades in: wait for the end of its enter animation.
		await waitFor(() => expect(drawer).toBeVisible());
	});

	it("names a ticket that the mirror lacks and offers to sync", async () => {
		const user = userEvent.setup();
		await renderRuns();
		const sync = vi.spyOn(commands, "syncNow");
		await user.type(await screen.findByRole("combobox", { name: "Ticket" }), "ACME-99");
		await user.click(screen.getByRole("button", { name: "Start run" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("This ticket is not here yet");
		expect(alert).not.toHaveTextContent("mirror");
		await user.click(within(alert).getByRole("button", { name: "Sync" }));
		await waitFor(() => expect(sync).toHaveBeenCalled());
		sync.mockRestore();
	});

	it("starts a run from a ticket key, and the Queued count grows", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		await unwrap(commands.runCancel((await find("ACME-3")).id));
		await renderRuns();
		const before = (await unwrap(commands.runsList())).filter((r) => r.lane === "queued").length;
		await user.type(await screen.findByRole("combobox", { name: "Ticket" }), "ACME-3");
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
		// The run view opens wide, next to the lanes.
		const panel = await screen.findByRole("complementary", { name: "ACME-2" });
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
		const panel = await screen.findByRole("complementary", { name: "ACME-2" });
		await user.click(await within(panel).findByRole("button", { name: "Kill run" }));
		await user.click(await within(panel).findByRole("button", { name: "Stop ACME-2?" }));
		await waitFor(async () => expect((await find("ACME-2")).state).toBe("Cancelled"));
	});

	it("unblocks and resumes from the run view", async () => {
		const user = userEvent.setup();
		await renderRuns();
		for (const [key, button, to] of [
			["ACME-9", "Unblock", "Working"],
			["ACME-6", "Resume", "Working"],
		] as const) {
			await user.click(await screen.findByRole("button", { name: new RegExp(key) }));
			const panel = await screen.findByRole("complementary", { name: key });
			if (button === "Resume")
				await user.type(
					await within(panel).findByRole("textbox", { name: "Added budget (USD)" }),
					"2",
				);
			await user.click(await within(panel).findByRole("button", { name: button }));
			await waitFor(async () => expect((await find(key)).state).toBe(to));
		}
	});

	it("unblocks with a message on Enter", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-9/ }));
		const panel = await screen.findByRole("complementary", { name: "ACME-9" });
		await user.type(
			await within(panel).findByRole("textbox", { name: "Message to the agent" }),
			"Keep both lines.{Enter}",
		);
		await waitFor(async () => expect((await find("ACME-9")).state).toBe("Working"));
	});

	it("keeps the events collapsed, then shows them as sentences with the raw JSON behind Details", async () => {
		const user = userEvent.setup();
		await renderRuns();
		await user.click(await screen.findByRole("button", { name: /ACME-2/ }));
		const panel = await screen.findByRole("complementary", { name: "ACME-2" });
		const events = await within(panel).findByRole("region", { name: /^Events/ });
		expect(within(events).queryByText("ACME-2 moved to Claimed")).toBeNull();
		await user.click(within(events).getByRole("button", { name: "Expand" }));
		expect(await within(events).findByText("ACME-2 moved to Claimed")).toBeInTheDocument();
		const fold = events.querySelector("details") as HTMLDetailsElement;
		expect(fold.open).toBe(false);
		await user.click(within(fold).getByText("Details"));
		expect(fold.open).toBe(true);
		expect(fold).toHaveTextContent('"from"');
	});

	it("shows the live strip, and the question and the approval of a waiting run on top", async () => {
		await renderRuns();
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: /ACME-1(?!\d)/ }));
		const panel = await screen.findByRole("complementary", { name: "ACME-1" });
		const steps = await within(panel).findByRole("region", { name: "Steps" });
		expect(within(steps).getByRole("list")).toBeInTheDocument();
		expect(await within(panel).findByRole("button", { name: "Send" })).toBeInTheDocument();
		expect(await within(panel).findByRole("button", { name: "Approve" })).toBeInTheDocument();
		expect(within(panel).getByRole("button", { name: "Reject" })).toBeInTheDocument();
	});
});
