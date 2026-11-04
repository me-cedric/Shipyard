import { act, screen } from "@testing-library/react";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { MachineUsage } from "./usage/machine-usage";

const handlers: Record<string, (e: { payload: unknown }) => void> = {};
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => {
		handlers[name] = cb;
		return () => {};
	}),
}));
vi.mock("@/lib/ipc", async (orig) => ({ ...(await orig<object>()), isTauri: () => true }));

describe("Factory / Usage: partial totals", () => {
	it("shows the totals and the progress line at the first event, before the scan ends", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		// The command never ends, as a scan that still reads.
		vi.spyOn(commands, "machineSpend").mockReturnValue(new Promise(() => {}));
		renderApp(
			<ShellProvider>
				<MachineUsage prices />
			</ShellProvider>,
		);
		expect(await screen.findAllByRole("status")).toBeTruthy();
		const day = new Date().toISOString().slice(0, 10);
		await vi.waitFor(() => expect(handlers["machine-spend-progress"]).toBeDefined());
		act(() =>
			handlers["machine-spend-progress"]?.({
				payload: {
					rows: [{ day, runner: "claude", model: "m", project: "p", tokens: 4321, costUsd: 1.5 }],
					read: 50,
					found: 851,
				},
			}),
		);
		expect(await screen.findByText("Read 50 of 851 files")).toBeInTheDocument();
		expect((await screen.findAllByText("4,321", {}, { timeout: 3000 })).length).toBeGreaterThan(0);
	});
});
