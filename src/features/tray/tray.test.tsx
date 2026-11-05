import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { renderApp } from "@/ui/test-utils";
import { TrayView } from "./index";

const emit = vi.fn();
const setSize = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({ setSize }),
	LogicalSize: class {
		constructor(
			public width: number,
			public height: number,
		) {}
	},
}));
const listen = vi.fn(async (..._a: unknown[]) => () => {});
vi.mock("@tauri-apps/api/event", () => ({
	emit: (...a: unknown[]) => emit(...a),
	listen: (...a: unknown[]) => listen(...a),
}));
vi.mock("@/lib/ipc", async (orig) => ({ ...(await orig<object>()), isTauri: () => true }));

async function renderTray() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return renderApp(<TrayView />);
}

describe("Menu bar panel", () => {
	it("shows the Needs you count, the spend and the sync state", async () => {
		await renderTray();
		expect(await screen.findByRole("heading", { name: /^Needs you \(\d+\)$/ })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Spend today" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open Shipyard" })).toBeInTheDocument();
	});

	it("stops a run with the same command as the Factory", async () => {
		const user = userEvent.setup();
		await renderTray();
		const run = (await unwrap(commands.runsList())).find((r) => r.lane === "working");
		if (!run) throw new Error("no working run in the mock");
		await user.click(await screen.findByRole("button", { name: `Stop ${run.key}` }));
		await user.click(await screen.findByRole("button", { name: `Stop ${run.key}?` }));
		await waitFor(async () =>
			expect((await unwrap(commands.runsList())).find((r) => r.id === run.id)?.state).toBe(
				"Cancelled",
			),
		);
	});

	it("flips the agents switch with the kill switch command", async () => {
		const user = userEvent.setup();
		await renderTray();
		await user.click(await screen.findByRole("switch", { name: "Agents on" }));
		await waitFor(async () => expect(await unwrap(commands.killSwitchGet())).toBe(true));
	});

	it("shows nothing when the setting is off", async () => {
		mockState().prefs.tray = false;
		const { container } = await renderTray();
		await waitFor(() => expect(container).toBeEmptyDOMElement());
		mockState().prefs.tray = true;
	});

	it("tells the main window when the project changes", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/beta", false));
		await renderTray();
		const other = (await unwrap(commands.projectsList())).find((p) => p.name === "beta");
		if (!other) throw new Error("no second project");
		await user.click(await screen.findByRole("combobox", { name: /project/i }));
		await user.click(await screen.findByRole("option", { name: other.name }));
		await waitFor(() => expect(emit).toHaveBeenCalledWith("project-switched", other.id));
	});

	it("closes on Escape and lists what the count counts", async () => {
		const user = userEvent.setup();
		const close = vi.spyOn(commands, "trayClose");
		await renderTray();
		const head = await screen.findByRole("heading", { name: /^Needs you \((\d+)\)$/ });
		const count = Number(/\((\d+)\)/.exec(head.textContent ?? "")?.[1]);
		await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(Math.min(count, 3)));
		await user.keyboard("{Escape}");
		expect(close).toHaveBeenCalled();
	});

	it("shows today large, the month, seven bars and the running agents", async () => {
		await renderTray();
		const spend = within(await screen.findByRole("region", { name: "Spend today" }));
		expect(spend.getByText("Month")).toBeInTheDocument();
		expect(spend.getAllByText(/^\$/).length).toBeGreaterThanOrEqual(2);
		expect(
			document.querySelectorAll("section[aria-label='Spend today'] [aria-hidden] > span"),
		).toHaveLength(7);
		expect(await screen.findByRole("heading", { name: /^\d+ running$/ })).toBeInTheDocument();
	});

	it("reads every query again when the panel gains focus and on each sync tick", async () => {
		const usage = vi.spyOn(commands, "machineSpend");
		await renderTray();
		await screen.findByRole("region", { name: "Spend today" });
		const before = usage.mock.calls.length;
		fireEvent.focus(window);
		await waitFor(() => expect(usage.mock.calls.length).toBeGreaterThan(before));
		// The panel listens to the tick that the main window listens to.
		expect(listen.mock.calls.map((c) => c[0])).toContain("sync-tick");
		usage.mockRestore();
	});

	it("shows the spend of every AI tool on this computer, today and this month", async () => {
		const today = new Date().toISOString().slice(0, 10);
		const row = (day: string, costUsd: number | null) => ({
			day,
			runner: "claude",
			model: "opus",
			project: "",
			tokens: 10,
			costUsd,
		});
		vi.spyOn(commands, "machineSpend").mockResolvedValue({
			status: "ok",
			data: {
				rows: [row(today, 2.25), row(today, 1.25), row(today, null)],
				budgets: [{ runner: "*", usd: 100 }],
			},
		});
		await renderTray();
		const spend = within(await screen.findByRole("region", { name: "Spend today" }));
		// Two rows of today make $3.50, today and in the month; a row with no price counts as zero.
		expect(await spend.findAllByText("$3.50")).toHaveLength(2);
		expect(spend.getByRole("progressbar", { name: "Month" })).toBeInTheDocument();
		vi.restoreAllMocks();
	});

	it("opens the window on the item of a Needs you row", async () => {
		const user = userEvent.setup();
		const open = vi.spyOn(commands, "trayOpen");
		await renderTray();
		const rows = await screen.findAllByRole("listitem");
		await user.click(within(rows[0] as HTMLElement).getByRole("button"));
		expect(open).toHaveBeenCalled();
		await waitFor(() =>
			expect(emit).toHaveBeenCalledWith("open-ref", expect.stringMatching(/^(run|pr):/)),
		);
	});

	it("hides the empty blocks, shows seven bars by spend and fits the window to the content", async () => {
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(private cb: () => void) {}
				observe() {
					this.cb();
				}
				disconnect() {}
			},
		);
		await renderTray();
		await screen.findByRole("region", { name: "Spend today" });
		const bars = [
			...document.querySelectorAll<HTMLElement>("section[aria-label='Spend today'] [title]"),
		];
		expect(bars).toHaveLength(7);
		for (const b of bars) expect(Number.parseFloat(b.style.height)).toBeGreaterThanOrEqual(2);
		await waitFor(() => expect(setSize).toHaveBeenCalled());
		const size = setSize.mock.calls.at(-1)?.[0] as { width: number; height: number };
		expect(size.width).toBe(360);
		expect(size.height).toBeGreaterThanOrEqual(280);
		expect(size.height).toBeLessThanOrEqual(
			Math.max(280, Math.round(window.screen.availHeight * 0.8)),
		);
		vi.unstubAllGlobals();
	});

	it("shows no Needs you block and no running row when there is nothing to show", async () => {
		vi.spyOn(commands, "runsList").mockResolvedValue({ status: "ok", data: [] });
		await renderTray();
		await screen.findByRole("region", { name: "Spend today" });
		expect(screen.queryByRole("heading", { name: /running/ })).toBeNull();
		expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent("alpha");
		vi.restoreAllMocks();
	});
});
