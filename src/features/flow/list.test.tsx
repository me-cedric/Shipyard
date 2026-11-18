import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nameOf } from "@/features/factory/runs/run-live";
import { commands, unwrap, type WorkItemView_Serialize } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

type User = ReturnType<typeof userEvent.setup>;

/** Changes one ticket of the fake mirror. */
const patch = (key: string, change: Partial<WorkItemView_Serialize>) => {
	const m = mockState().sync.mirror;
	const i = m.findIndex((t) => t.key === key);
	m[i] = { ...m[i], ...change } as WorkItemView_Serialize;
};
/** The feature rows of the tickets: one row for each ticket, the key is in the name of the row. */
const TICKET = /ACME-\d+/;
const rows = () => screen.findAllByRole("button", { name: TICKET });
const rowOf = (key: string) => screen.findByRole("button", { name: new RegExp(`${key}(?!\\d)`) });
const count = () => screen.queryAllByRole("button", { name: TICKET }).length;
const pick = async (user: User, name: string, option: string) => {
	await user.click(screen.getByRole("combobox", { name }));
	await user.click(await screen.findByRole("option", { name: option }));
};
/** The page of the ticket on its Brief, from the menu of its row: the old drawer of the backlog. */
const openTicket = async (user: User, key: string) => {
	fireEvent.contextMenu(await rowOf(key));
	await user.click(await screen.findByRole("menuitem", { name: "Edit the ticket" }));
	await screen.findByRole("region", { name: key });
	await screen.findByRole("combobox", { name: "Assignee" });
};

describe("Flow / List: the tickets of the backlog", () => {
	it("shows the count before it writes and one row for each ticket after the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/flow/list");
		await user.click(await screen.findByRole("button", { name: "Import" }));
		expect(await within(screen.getByRole("main")).findByRole("status")).toHaveTextContent(
			"10 open tickets",
		);
		expect(mockState().sync.mirror).toHaveLength(0);
		await user.click(screen.getByRole("button", { name: "Confirm" }));
		await waitFor(() => expect(mockState().sync.mirror).toHaveLength(10));
		for (let n = 1; n <= 10; n += 1) expect(await rowOf(`ACME-${n}`)).toBeInTheDocument();
		// The groups of the backlog are gone: the Status filter gives each count (7, 2 and 1).
		for (const [status, n] of [
			["To Do", 7],
			["In Progress", 2],
			["In Review", 1],
		] as const) {
			await pick(user, "Status", status);
			await waitFor(() => expect(count()).toBe(n));
		}
		await pick(user, "Status", "All statuses");
		// The closed tickets are not in the import.
		expect(mockState().sync.mirror.some((t) => t.key === "ACME-11")).toBe(false);
	});

	it("leaves the mirror empty when the person cancels", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/flow/list");
		await user.click(await screen.findByRole("button", { name: "Import" }));
		await user.click(await screen.findByRole("button", { name: "Cancel" }));
		expect(mockState().sync.mirror).toHaveLength(0);
		expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
	});

	it("filters the feature rows by assignee, status, label and run state with no tick", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mockState().sync.claimed.push("ACME-3");
		mountApp("/flow/list");
		await rows();
		await pick(user, "Assignee", "Grace Hopper");
		await waitFor(() => expect(count()).toBe(3));
		await pick(user, "Assignee", "All assignees");
		await pick(user, "Status", "In Review");
		await waitFor(() => expect(count()).toBe(1));
		expect(await rowOf("ACME-7")).toBeInTheDocument();
		await pick(user, "Status", "All statuses");
		await pick(user, "Label", "bug");
		await waitFor(() => expect(count()).toBe(2));
		await pick(user, "Label", "All labels");
		await pick(user, "Run", "Claimed");
		await waitFor(() => expect(count()).toBe(1));
		expect(await rowOf("ACME-3")).toBeInTheDocument();
		await pick(user, "Run", "All runs");
		// The search of Flow is the search of the tickets (the old Search box of the backlog).
		await user.type(screen.getByRole("searchbox", { name: "Search runs" }), "export");
		await waitFor(() => expect(count()).toBe(1));
		expect(mockState().sync.ticks).toBe(0);
	});

	it("shows the mirror when the tracker cannot be reached", async () => {
		await withTracker();
		await importAll();
		delete mockState().secrets.acme;
		mountApp("/flow/list");
		for (let n = 1; n <= 10; n += 1) expect(await rowOf(`ACME-${n}`)).toBeInTheDocument();
		expect(mockState().sync.ticks).toBe(0);
	});

	it("shows the run state by a mark and an assignee that the team lacks", async () => {
		await withTracker();
		await importAll();
		mockState().sync.claimed.push("ACME-1");
		patch("ACME-2", { assignee: "Ghost Writer" });
		mountApp("/flow/list");
		await rows();
		expect(within(await rowOf("ACME-1")).getByRole("img", { name: "Claimed" })).toBeInTheDocument();
		expect(
			within(await rowOf("ACME-2")).getByRole("img", { name: "Unknown member" }),
		).toBeInTheDocument();
	});

	it("ranks the members of an item by skill and capacity and assigns nobody by itself", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/flow/list");
		await rows();
		await openTicket(user, "ACME-8");
		await user.click(await screen.findByRole("combobox", { name: "Assignee" }));
		const names = (await screen.findAllByRole("option")).map((o) => o.textContent ?? "").slice(1); // the first option is the "Unassigned" state
		// The item is labelled `ui`: the members with that skill come first.
		expect(names[0]).toMatch(/^(Grace Hopper|Edsger Dijkstra)/);
		expect(names[1]).toMatch(/^(Grace Hopper|Edsger Dijkstra)/);
		expect(screen.getByRole("option", { name: /^Alan Turing/ })).toHaveTextContent("Full");
		expect(mockState().sync.mirror.find((t) => t.key === "ACME-8")?.assignee).toBeNull();
	});

	it("assigns a member and marks the item for the agent on a click each", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/flow/list");
		await rows();
		await openTicket(user, "ACME-3");
		await user.click(await screen.findByRole("combobox", { name: "Assignee" }));
		await user.click(await screen.findByRole("option", { name: /^Ada Lovelace/ }));
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.assignee).toBe(
				"Ada Lovelace",
			),
		);
		expect(screen.queryByText("Eligible for pickup")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Mark for agent" }));
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.labels).toContain("shipyard"),
		);
		// Assigned to me and marked: eligible.
		expect(await screen.findByText("Eligible for pickup")).toBeInTheDocument();
	});

	it("starts a run from the menu of the row of a ticket with no run", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const free = mockState().sync.mirror.find((t) => t.category !== "done");
		if (!free) throw new Error("no ticket");
		vi.spyOn(commands, "featuresList").mockResolvedValue({
			status: "ok",
			data: [
				{
					title: "Free ticket",
					stage: "idea",
					mark: null,
					ticket: `wi:${free.key}`,
					change: null,
					run: null,
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
		const start = vi.spyOn(commands, "runStart");
		mountApp("/flow/list");
		fireEvent.contextMenu(await rowOf(free.key));
		await user.click(await screen.findByRole("menuitem", { name: "Start run" }));
		await waitFor(() => expect(start).toHaveBeenCalledWith(free.key));
		vi.restoreAllMocks();
	});

	it("links the reason of a pickup label that is off to the setting", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const view = mockState().sync.automation;
		await unwrap(commands.syncAutomationSave({ ...view, pickup: { ...view.pickup, label: null } }));
		const router = mountApp("/flow/list");
		await rows();
		await openTicket(user, "ACME-3");
		await user.click(await screen.findByRole("button", { name: "Pickup label is off" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/project"));
	});

	it("brings a ticket by its key from the field above the rows", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/flow/list");
		await user.click(await screen.findByRole("button", { name: "Bring a ticket by its key" }));
		expect(screen.queryByRole("button", { name: "Adopt" })).toBeNull();
		expect(await screen.findByRole("textbox", { name: "Ticket key" })).toHaveFocus();
	});

	it("names the issue tracker as missing when the project has none (REQ-007)", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/flow/list");
		expect(await screen.findByRole("button", { name: "issue tracker" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Connect an issue tracker" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
	});

	it("opens Connections with the add form when no issue tracker connection exists", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/flow/list");
		await user.click(await screen.findByRole("button", { name: "Connect an issue tracker" }));
		// The connections of an issue tracker are under This project (`spec:app-redesign#REQ-024`).
		await waitFor(() => expect(router.state.location.href).toBe("/setup/project?page=connections"));
		expect(await screen.findByRole("textbox", { name: "Name" })).toBeInTheDocument();
	});

	it("opens the issue tracker select when a connection exists but the project has none linked", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "linear",
				url: "",
				user: null,
			}),
		);
		// the mock links the first connection of a group: unlink it
		const file = (await unwrap(commands.projectSettings()))?.file;
		if (!file) throw new Error("no project file");
		await unwrap(
			commands.projectFileSave({ ...file, connections: { tracker: null, forge: null } }),
		);
		const router = mountApp("/flow/list");
		await user.click(await screen.findByRole("button", { name: "Connect an issue tracker" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/setup/project"));
		await waitFor(() =>
			expect(screen.getByRole("combobox", { name: "Issue tracker" })).toHaveFocus(),
		);
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		await importAll();
		mountApp("/flow/list");
		await rows();
		expect(screen.getByRole("button", { name: "Importer" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Statut" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Assigné" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Apporter un ticket par sa clé" }),
		).toBeInTheDocument();
	});
});

const CH = "docs/openspec/changes";

// Specs / Changes moved to Flow / List: a change is a feature row, and New change is above the rows.
describe("Flow / List: the changes of Specs", () => {
	const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));

	it("lists each change as a row with its stage and state", async () => {
		await open();
		mountApp("/flow/list");
		for (const id of ["add-auth", "add-billing", "add-export"])
			expect(await screen.findByRole("button", { name: new RegExp(id) })).toBeVisible();
	});

	it("shows one New change action when there is no change", async () => {
		for (const p of Object.keys(mockState().specs.files))
			if (p.startsWith(`${CH}/`)) delete mockState().specs.files[p];
		await open();
		mountApp("/flow/list");
		expect(await screen.findAllByRole("button", { name: "New change" })).toHaveLength(1);
	});

	it("creates a change from a plain title and refuses a title with no letter", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/flow/list");
		await user.click(await screen.findByRole("button", { name: "New change" }));
		await user.type(screen.getByRole("textbox", { name: "Title" }), "!!");
		await user.click(screen.getByRole("button", { name: "Create" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Use a title with at least one");
		await user.clear(screen.getByRole("textbox", { name: "Title" }));
		await user.type(screen.getByRole("textbox", { name: "Title" }), "Add search");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await screen.findByRole("navigation", { name: "Artifacts" });
		expect(mockState().specs.files[`${CH}/add-search/proposal.md`]?.text).toContain("# Add search");
		expect(await screen.findAllByText("Add search")).not.toHaveLength(0);
	});

	it("opens a change on its feature page with the keyboard", async () => {
		const user = userEvent.setup();
		await open();
		const router = mountApp("/flow/list");
		(await screen.findByRole("button", { name: /add-auth/ })).focus();
		await user.keyboard("{Enter}");
		expect(await screen.findByRole("navigation", { name: "Artifacts" })).toBeVisible();
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/flow/feature/change%3Aadd-auth"),
		);
	});

	it("copies the ref of the change from the menu of its row", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/flow/list");
		fireEvent.contextMenu(await screen.findByRole("button", { name: /add-billing/ }));
		await user.click(await screen.findByRole("menuitem", { name: "Copy reference" }));
		expect(await navigator.clipboard.readText()).toBe("change:add-billing");
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await open();
		mountApp("/flow/list");
		expect(await screen.findByRole("button", { name: /add-auth/ })).toBeVisible();
		expect(screen.getByRole("button", { name: "Nouveau changement" })).toBeInTheDocument();
	});
});

// The board of Work moved to Flow / Flow: a card is a feature, and the move of its ticket is in its menu.
describe("Flow, the moves of Work / Board", () => {
	const cardOf = async (key: string) =>
		(await screen.findAllByText(new RegExp(`${key}$`)))[0] as HTMLElement;
	const move = async (user: ReturnType<typeof userEvent.setup>, key: string, status: string) => {
		fireEvent.contextMenu(await cardOf(key));
		await user.click(await screen.findByRole("menuitem", { name: `Move to ${status}` }));
	};

	it("shows the title and who works on the feature on its card", async () => {
		await withTracker();
		await importAll();
		mountApp("/work/board");
		const who = (await unwrap(commands.featuresList())).find((f) => f.ticket === "wi:ACME-1")?.who;
		expect(who).toBeTruthy();
		const card = (await cardOf("ACME-1")).closest("li") as HTMLElement;
		expect(card).toHaveTextContent("Fix login redirect");
		expect(card).toHaveTextContent(nameOf(who?.name ?? ""));
	});

	it("sends the transition when the menu of a card moves its ticket", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/board");
		await move(user, "ACME-3", "In Progress");
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.status).toBe("In Progress"),
		);
		await move(user, "ACME-3", "To Do");
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.status).toBe("To Do"),
		);
	});

	it("shows the refusal and keeps the card when the tracker refuses", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		// A status with no transition: the fake tracker refuses a move into it.
		patch("ACME-7", { status: "Blocked" });
		mountApp("/work/board");
		await move(user, "ACME-5", "Blocked");
		expect(await screen.findByRole("alert")).toHaveTextContent("no transition to `Blocked`");
		expect(mockState().sync.mirror.find((t) => t.key === "ACME-5")?.status).toBe("In Progress");
		expect(await cardOf("ACME-5")).toBeInTheDocument();
	});
});
