import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { PLACE_IDS } from "./places";

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
	await screen.findByRole("navigation", { name: "Sidebar" });
	await user.keyboard("{Control>}k{/Control}");
	const bar = await screen.findByRole("combobox", { name: "Ask or tell Shipyard" });
	await waitFor(() => expect(bar).toHaveFocus());
	return bar;
}

describe("Ask bar and its panel (shell REQ-005, app-redesign REQ-004)", () => {
	it("lists an action for each place, with its shortcut", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		const panel = within(await screen.findByRole("listbox"));
		for (const i of PLACE_IDS.keys()) {
			const option = panel.getByRole("option", { name: new RegExp(`Ctrl\\+${i + 1}$`) });
			expect(option).toBeVisible();
		}
		expect(panel.getByRole("option", { name: /Toggle inspector.*Ctrl\+I$/ })).toBeVisible();
		expect(screen.getByText("Go to")).toBeVisible();
		expect(screen.getByText("Do")).toBeVisible();
		expect(screen.getByRole("button", { name: "Open the full assistant" })).toBeVisible();
	});

	it("lists a destination for each page that left the section switch", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home");
		const bar = await openPalette(user);
		const panel = within(await screen.findByRole("listbox"));
		for (const name of [
			"Projects",
			"Flow / Impacts",
			"Code / Pull requests",
			"Setup / Connections",
			"Setup / Tickets",
			"Setup / Extensions",
			"Setup / Health of this project",
			"Setup / Agents and rules",
			"Setup / Outside agents",
			"Setup / Health of this computer",
			"Setup / Logs and feedback",
			"Setup / Look and layout",
		])
			expect(await panel.findByRole("option", { name })).toBeInTheDocument();
		await user.type(bar, "Extensions{ArrowDown}{Enter}");
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=extensions"));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("hides the impacts and the doors of a scope that the role does not see", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
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
		mountApp("/home");
		await openPalette(user);
		const panel = within(await screen.findByRole("listbox"));
		expect(await panel.findByRole("option", { name: "Setup / Look and layout" })).toBeVisible();
		await waitFor(() => expect(panel.queryByRole("option", { name: "Flow / Impacts" })).toBeNull());
		expect(panel.queryByRole("option", { name: "Setup / Extensions" })).toBeNull();
		expect(panel.queryByRole("option", { name: "Code / Pull requests" })).toBeNull();
	});

	it("runs an action by name with Enter and closes", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		await user.keyboard("Toggle inspector{ArrowDown}{Enter}");
		const inspector = screen.getByLabelText("Inspector", { selector: "aside" });
		await waitFor(() => expect(inspector).toHaveAttribute("data-open", "true"));
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("opens no dialog, and Escape closes the panel", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(await screen.findByRole("listbox")).toBeVisible();
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("runs the item that an arrow key chose, and sends other text to the assistant", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		const bar = await openPalette(user);
		await user.type(bar, "Toggle inspector");
		await user.keyboard("{ArrowDown}{Enter}");
		const inspector = screen.getByLabelText("Inspector", { selector: "aside" });
		await waitFor(() => expect(inspector).toHaveAttribute("data-open", "true"));
		await user.click(bar);
		await user.type(bar, "write a poem{Enter}");
		expect(await screen.findByRole("complementary", { name: /assistant/i })).toBeVisible();
	});

	it("answers what blocks with each blocked feature and one action for it", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const spy = vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [
				{
					title: "Fix menu",
					stage: "build",
					mark: "blocked",
					ticket: null,
					change: null,
					run: "run:1",
					pr: null,
					who: null,
					runState: null,
					approvals: 0,
					questions: 0,
					checks: null,
					stop: null,
				},
				{
					title: "Cache list",
					stage: "build",
					mark: "blocked",
					ticket: null,
					change: null,
					run: "run:2",
					pr: null,
					who: null,
					runState: null,
					approvals: 0,
					questions: 0,
					checks: null,
					stop: null,
				},
			],
		});
		mountApp("/home/today");
		const bar = await openPalette(user);
		await user.type(bar, "what blocks the release?{Enter}");
		expect(await screen.findByRole("button", { name: "Unblock Fix menu" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Unblock Cache list" })).toBeVisible();
		// The text stays: an answer shows for it, and the assistant does not open.
		expect(bar).toHaveValue("what blocks the release?");
		spy.mockRestore();
	});

	it("answers what stopped with the main action of the stop state, in one click (REQ-014)", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const paused = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-6");
		if (!paused) throw new Error("the mock has no ACME-6");
		// The run stopped at its budget limit.
		mockState()
			.factory.runs.find((r) => r.id === paused.id)
			?.log.push({
				id: 9991,
				step: null,
				kind: "note",
				payload: JSON.stringify({ stop: "budget" }),
				ts: Date.now(),
			});
		// The mock gives no reason to a run: say it from the list, as the app does.
		vi.spyOn(commands, "runsList").mockResolvedValue({
			status: "ok",
			data: (await unwrap(commands.runsList())).map((r) =>
				r.id === paused.id ? { ...r, reason: "budget" } : r,
			),
		});
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [
				{
					title: "Cache the list",
					stage: "build",
					mark: "stopped",
					ticket: null,
					change: null,
					run: `run:${paused.id}`,
					pr: null,
					who: null,
					runState: "Paused",
					approvals: 0,
					questions: 0,
					checks: null,
					stop: "add_budget",
				},
			],
		});
		const resume = vi.spyOn(commands, "runResume");
		mountApp("/home/today");
		const bar = await openPalette(user);
		await user.type(bar, "what stopped?{Enter}");
		await user.click(await screen.findByRole("button", { name: "Add budget Cache the list" }));
		await waitFor(() => expect(resume).toHaveBeenCalledWith(paused.id, 2, 0, null));
	});

	it("turns the stop action of the answer off for a viewer", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const failed = (await unwrap(commands.runsList())).find((r) => r.key === "ACME-6");
		if (!failed) throw new Error("the mock has no ACME-6");
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		vi.spyOn(commands, "runsList").mockResolvedValue({
			status: "ok",
			data: (await unwrap(commands.runsList())).map((r) =>
				r.id === failed.id ? { ...r, state: "Failed" as const } : r,
			),
		});
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [
				{
					title: "Cache the list",
					stage: "build",
					mark: "stopped",
					ticket: null,
					change: null,
					run: `run:${failed.id}`,
					pr: null,
					who: null,
					runState: "Failed",
					approvals: 0,
					questions: 0,
					checks: null,
					stop: "try_again",
				},
			],
		});
		mountApp("/home/today");
		const bar = await openPalette(user);
		await user.type(bar, "what stopped?{Enter}");
		expect(await screen.findByRole("button", { name: "Try again Cache the list" })).toBeDisabled();
	});

	it("sends a question that holds a match word to the assistant draft with Open the full assistant", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		const bar = await openPalette(user);
		await user.type(bar, "How do I stop the dev server?{Enter}");
		await user.click(await screen.findByRole("button", { name: "Open the full assistant" }));
		const draft = await screen.findByRole("textbox", { name: "Message" });
		await waitFor(() => expect(draft).toHaveValue("How do I stop the dev server?"));
	});

	it("opens a ref with Enter", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home/today");
		await openPalette(user);
		await user.keyboard("adr:0004");
		await user.keyboard("{ArrowDown}{Enter}");
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		expect(await within(inspector).findByRole("button", { name: /^adr:0004/ })).toBeVisible();
	});

	it("hides an action that cannot run", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		const input = await openPalette(user);
		// Nothing is staged, so the commit action is off.
		await user.type(input, "Commit");
		expect(screen.queryByRole("option", { name: /^Commit/ })).toBeNull();
	});

	it("shows French labels after the language changes", async () => {
		const user = userEvent.setup();
		mockState().prefs.lang = "fr";
		mountApp("/home");
		await screen.findByRole("navigation", { name: "Barre latérale" });
		await user.keyboard("{Control>}k{/Control}");
		await screen.findByRole("combobox", { name: "Demander ou dire à Shipyard" });
		expect(await screen.findByRole("option", { name: /Basculer l'inspecteur/ })).toBeVisible();
	});
});

describe("project actions of the palette", () => {
	it("lists Switch project and runs Close project", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/home");
		await openPalette(user);
		const dialog = within(await screen.findByRole("listbox"));
		expect(dialog.getByRole("option", { name: /^Switch project/ })).toBeVisible();
		await user.keyboard("Close project{ArrowDown}{Enter}");
		await waitFor(async () => expect(await unwrap(commands.projectsActive())).toBeNull());
		expect(mockState().projects).toHaveLength(1);
	});

	it("hides Close project when no project is open", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		const input = await openPalette(user);
		await user.type(input, "Close project");
		expect(screen.queryByRole("option", { name: /^Close project/ })).toBeNull();
	});
});

describe("palette pages and tickets", () => {
	it("lists a go action for a tab", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		expect(await screen.findByRole("option", { name: "Library / Questions" })).toBeVisible();
	});

	it("names the home of Library once in the Go to list", async () => {
		const user = userEvent.setup();
		mountApp("/home");
		await openPalette(user);
		const go = await screen.findByRole("group", { name: "Go to" });
		expect(await within(go).findByRole("option", { name: "Library" })).toBeVisible();
		expect(screen.queryByRole("option", { name: "Library / Library" })).toBeNull();
	});

	it("finds a ticket by its key", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const item = { key: "ACME-7", title: "Pay the invoice", status: "To do" };
		mockState().sync.mirror.push(item as never);
		mountApp("/home/today");
		await openPalette(user);
		await user.keyboard("ACME-7");
		expect(await screen.findByRole("option", { name: /^wi:ACME-7 Pay the invoice/ })).toBeVisible();
	});

	it("groups hits by kind with a snippet that marks the words, and asks the assistant", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mockState().sync.mirror.push({
			key: "ACME-8",
			title: "Pay the invoice",
			status: "To do",
		} as never);
		mountApp("/home/today");
		await openPalette(user);
		await user.keyboard("invoice");
		const dialog = within(await screen.findByRole("listbox"));
		const option = await dialog.findByRole("option", { name: /^wi:ACME-8/ });
		expect(within(option).getByText("invoice").tagName).toBe("MARK");
		await user.click(dialog.getByRole("option", { name: "Ask the assistant" }));
		// The shell puts the text in the message box of the open thread, and does not send it.
		expect(await screen.findByRole("complementary", { name: /assistant/i })).toBeVisible();
	});

	it("opens the page of a ref, selects it, and drops it when the view changes", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/home/today");
		await openPalette(user);
		await user.keyboard("adr:0004{ArrowDown}{Enter}");
		const inspector = await screen.findByLabelText("Inspector", { selector: "aside" });
		expect(await within(inspector).findByRole("button", { name: /^adr:0004/ })).toBeVisible();
		await waitFor(() => expect(router.state.location.pathname).toBe("/library/decisions"));
		// The page opens on the record, not on its first item.
		const decisions = await screen.findByRole("list", { name: "Decisions" });
		expect(await within(decisions).findByRole("button", { name: /0004/ })).toHaveAttribute(
			"aria-current",
			"true",
		);
		expect(within(inspector).getByRole("button", { name: /^adr:0004/ })).toBeVisible();
		await router.navigate({ to: "/specs/questions" });
		await waitFor(() =>
			expect(within(inspector).queryByRole("button", { name: /^adr:0004/ })).toBeNull(),
		);
	});
});
