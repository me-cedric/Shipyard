import { act, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const handlers: Record<string, (e: { payload: unknown }) => void> = {};
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => {
		handlers[name] = cb;
		return () => {};
	}),
	emit: vi.fn(),
}));
vi.mock("@tauri-apps/api/path", () => ({
	homeDir: async () => "/home/me",
	join: async (...p: string[]) => p.join("/"),
}));
vi.mock("@/lib/ipc", async (orig) => ({ ...(await orig<object>()), isTauri: () => true }));

const bell = () => screen.getByRole("button", { name: "Notifications" });
const unread = () => bell().textContent ?? "";
const tick = () => act(async () => handlers["sync-tick"]?.({ payload: null }));

describe("Notification sources of the shell", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	});
	afterEach(() => vi.restoreAllMocks());

	it("shows a failed run once when its event comes twice", async () => {
		const failed = (await unwrap(commands.runsList())).find((r) => r.state === "Failed");
		if (!failed) throw new Error("no failed run");
		mountApp("/");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await waitFor(() => expect(handlers["factory-run"]).toBeDefined());
		for (let i = 0; i < 2; i++)
			await act(async () => {
				handlers["factory-run"]?.({ payload: { run: failed.id, id: "" } });
				await new Promise((r) => setTimeout(r, 100));
			});
		await waitFor(() => expect(unread()).toContain("1 unread"));
		expect(unread()).not.toContain("2 unread");
	});

	it("primes a source only after a read that worked", async () => {
		const rows = await unwrap(commands.codeMyChecks());
		const read = vi
			.spyOn(commands, "codeMyChecks")
			.mockResolvedValueOnce({ status: "error", error: "offline" } as never);
		mountApp("/");
		await screen.findByRole("navigation", { name: "Sidebar" });
		await waitFor(() => expect(handlers["sync-tick"]).toBeDefined());
		await tick();
		read.mockResolvedValue({ status: "ok", data: rows });
		await tick();
		// The first good read is the quiet one: it makes no entry.
		expect(unread()).not.toContain("unread");
	});
});
