import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const o = en.onboarding;
const titles = Object.values(o.steps).map((s) => s.title);
const openProject = () => unwrap(commands.projectsOpen("/mock/alpha", false));

describe("Onboarding tour", () => {
	it("does not open at the first launch, before a project", async () => {
		mockState().prefs.tourSeen = false;
		mountApp("/home/today");
		await screen.findByRole("heading", { level: 1, name: en.ui.welcome });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(mockState().prefs.tourSeen).toBe(false);
	});

	it("opens once when the first project is open, turns with Next and the arrows, and Escape ends it for good", async () => {
		const user = userEvent.setup();
		mockState().prefs.tourSeen = false;
		await openProject();
		mountApp("/home/today");
		const dialog = await screen.findByRole("dialog", { name: titles[0] });
		// The glossary words of the sentence are marked (REQ-008).
		const body = within(dialog).getByText(
			(_, el) => el?.tagName === "P" && !!el.textContent?.startsWith("Design, specs"),
		);
		expect(within(body).getByRole("button", { name: "specs" })).toBeInTheDocument();
		expect(within(dialog).getByText("Step 1 of 6")).toBeInTheDocument();
		await user.click(within(dialog).getByRole("button", { name: o.next }));
		expect(await screen.findByRole("dialog", { name: titles[1] })).toBeInTheDocument();
		await user.keyboard("{ArrowRight}");
		expect(await screen.findByRole("dialog", { name: titles[2] })).toBeInTheDocument();
		await user.keyboard("{ArrowLeft}");
		expect(await screen.findByRole("dialog", { name: titles[1] })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(mockState().prefs.tourSeen).toBe(true));
	});

	it("stays closed once seen, replays from the palette at step 1 and ends on the manual", async () => {
		const user = userEvent.setup();
		const router = mountApp("/home/today");
		await screen.findByRole("navigation", { name: "Sidebar" });
		expect(screen.queryByRole("dialog")).toBeNull();
		await user.keyboard("{Control>}k{/Control}");
		await user.type(await screen.findByRole("combobox"), o.replay);
		await user.keyboard("{Enter}");
		const first = await screen.findByRole("dialog", { name: titles[0] });
		expect(within(first).queryByRole("button", { name: o.back })).toBeNull();
		for (const title of titles.slice(1)) {
			await user.click(screen.getByRole("button", { name: o.next }));
			expect(await screen.findByRole("dialog", { name: title })).toBeInTheDocument();
		}
		expect(screen.queryByRole("button", { name: o.next })).toBeNull();
		await user.click(screen.getByRole("button", { name: o.manual }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/knowledge/manual"));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("marks the tour as seen when a setup action leaves it", async () => {
		const user = userEvent.setup();
		mockState().prefs.tourSeen = false;
		mockState().prefs.defaultAgent = "";
		await openProject();
		mountApp("/home/today");
		await screen.findByRole("dialog", { name: titles[0] });
		for (let i = 0; i < 2; i++) await user.keyboard("{ArrowRight}");
		const dialog = await screen.findByRole("dialog", { name: o.steps.connect.title });
		const [connect] = await within(dialog).findAllByRole("button", {
			name: o.setup.action.connect,
		});
		await user.click(connect as HTMLElement);
		await waitFor(() => expect(screen.queryByRole("dialog", { name: titles[2] })).toBeNull());
		await waitFor(() => expect(mockState().prefs.tourSeen).toBe(true));
	});

	it("shows the loading pattern while the permissions load", async () => {
		const user = userEvent.setup();
		mockState().prefs.tourSeen = false;
		await openProject();
		let release = () => {};
		const gate = new Promise<void>((done) => {
			release = done;
		});
		const list = commands.permissionsList;
		vi.spyOn(commands, "permissionsList").mockImplementation(async () => {
			await gate;
			return list();
		});
		mountApp("/home/today");
		await screen.findByRole("dialog", { name: titles[0] });
		for (let i = 0; i < 4; i++) await user.keyboard("{ArrowRight}");
		const dialog = await screen.findByRole("dialog", { name: o.steps.permissions.title });
		expect(within(dialog).getByRole("status", { name: en.common.loading })).toBeInTheDocument();
		release();
		expect(await within(dialog).findByRole("list", { name: o.permissions.title })).toBeVisible();
	});

	it("asks for a permission after a click and sends a test notification", async () => {
		const user = userEvent.setup();
		mockState().prefs.tourSeen = false;
		await openProject();
		mountApp("/home/today");
		await screen.findByRole("dialog", { name: titles[0] });
		for (let i = 0; i < 4; i++) await user.keyboard("{ArrowRight}");
		const dialog = await screen.findByRole("dialog", { name: o.steps.permissions.title });
		const row = await within(dialog).findByRole("group", {
			name: o.permissions.kind.notifications,
		});
		expect(within(row).getByText(o.permissions.state.notAsked)).toBeInTheDocument();
		await user.click(within(row).getByRole("button", { name: o.permissions.allow }));
		expect(await within(row).findByText(o.permissions.state.on)).toBeInTheDocument();
		await user.click(within(row).getByRole("button", { name: o.permissions.test }));
		await waitFor(() =>
			expect(mockState().os).toContainEqual({ title: "Shipyard", body: o.permissions.testBody }),
		);
		const files = within(dialog).getByRole("group", { name: o.permissions.kind.files });
		expect(within(files).getByRole("button", { name: o.permissions.allow })).toBeInTheDocument();
	});

	it("shows the permissions and Replay the tour in Settings / Me", async () => {
		const user = userEvent.setup();
		mockState().permissions[1] = { kind: "files", state: "off", settings: true };
		mountApp("/settings/me");
		const files = await screen.findByRole("group", { name: o.permissions.kind.files });
		expect(within(files).getByText(o.permissions.state.off)).toBeInTheDocument();
		expect(within(files).getByRole("button", { name: o.permissions.settings })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: o.replay }));
		expect(await screen.findByRole("dialog", { name: titles[0] })).toBeInTheDocument();
	});

	it("speaks French", async () => {
		mockState().prefs.tourSeen = false;
		mockState().prefs.lang = "fr";
		await openProject();
		mountApp("/home/today");
		expect(
			await screen.findByRole("dialog", { name: "Une boucle, de l'idée au code fusionné" }),
		).toBeInTheDocument();
	});
});
