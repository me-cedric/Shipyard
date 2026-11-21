import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { resetPermissionsLater } from "@/lib/shell/permissions-later";
import { mountApp } from "@/test/mount";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

// spec:shell-setup-rights#REQ-010: the card "Shipyard needs N permissions".
describe("The permissions moment", () => {
	beforeEach(() => resetPermissionsLater());

	it("shows at a first launch with two permissions missing, and never asks for the keychain", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		const card = within(await screen.findByRole("dialog"));
		expect(card.getByRole("heading", { name: "Shipyard needs 2 permissions" })).toBeInTheDocument();
		// Notifications and Files only: no probe of the keychain.
		expect(card.getAllByRole("listitem").map((r) => r.textContent)).toEqual([
			expect.stringContaining("Notifications"),
			expect.stringContaining("Documents, Desktop and Downloads"),
		]);
		await idle(router);
	});

	it("asks each listed permission with Allow all", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: "Allow all" }));
		await waitFor(() => expect(mockState().permissions.map((p) => p.state)).toEqual(["on", "on"]));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await idle(router);
	});

	it("allows one permission and counts the rest", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		const card = within(await screen.findByRole("dialog"));
		await user.click(card.getAllByRole("button", { name: "Allow" })[0] as HTMLElement);
		expect(
			await screen.findByRole("heading", { name: "Shipyard needs 1 permission" }),
		).toBeInTheDocument();
		await idle(router);
	});

	it("goes away with Later and asks nothing", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		await screen.findByRole("dialog");
		await user.click(screen.getByRole("button", { name: "Later" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(mockState().permissions.map((p) => p.state)).toEqual(["notAsked", "notAsked"]);
		await idle(router);
	});

	it("waits for the first project: the first run comes first", async () => {
		const router = mountApp("/home/today");
		await screen.findByRole("heading", { name: "What is your job?" });
		expect(screen.queryByRole("dialog")).toBeNull();
		await idle(router);
	});

	it("stays away when each permission is on", async () => {
		for (const p of mockState().permissions) p.state = "on";
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.queryByRole("dialog")).toBeNull();
		await idle(router);
	});
});
