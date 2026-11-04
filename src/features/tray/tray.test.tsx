import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { renderApp } from "@/ui/test-utils";
import { TrayView } from "./index";

const emit = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
	emit: (...a: unknown[]) => emit(...a),
	listen: vi.fn(async () => () => {}),
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
});
