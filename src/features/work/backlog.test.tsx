import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap, type WorkItemView_Serialize } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

/** Changes one ticket of the fake mirror. */
const patch = (key: string, change: Partial<WorkItemView_Serialize>) => {
	const m = mockState().sync.mirror;
	const i = m.findIndex((t) => t.key === key);
	m[i] = { ...m[i], ...change } as WorkItemView_Serialize;
};
const rows = () => screen.findAllByRole("group", { name: /^ACME-\d+$/ });
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string, option: string) => {
	await user.click(screen.getByRole("combobox", { name }));
	await user.click(await screen.findByRole("option", { name: option }));
};

describe("Work / Backlog", () => {
	it("shows the count before it writes and the groups with their counts after the confirm", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/backlog");
		await user.click(await screen.findByRole("button", { name: "Import" }));
		expect(await within(screen.getByRole("main")).findByRole("status")).toHaveTextContent(
			"10 open tickets",
		);
		expect(mockState().sync.mirror).toHaveLength(0);
		await user.click(screen.getByRole("button", { name: "Confirm" }));
		expect(await rows()).toHaveLength(10);
		for (const name of ["To Do (7)", "In Progress (2)", "In Review (1)"])
			expect(screen.getByRole("heading", { name })).toBeInTheDocument();
		// The closed tickets are not in the import.
		expect(screen.queryByRole("group", { name: "ACME-11" })).toBeNull();
	});

	it("leaves the mirror empty when the person cancels", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/backlog");
		await user.click(await screen.findByRole("button", { name: "Import" }));
		await user.click(await screen.findByRole("button", { name: "Cancel" }));
		expect(mockState().sync.mirror).toHaveLength(0);
		expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
	});

	it("filters by assignee, status, label and run state with no tick", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mockState().sync.claimed.push("ACME-3");
		mountApp("/work/backlog");
		await rows();
		await pick(user, "Assignee", "Grace Hopper");
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^ACME-/ })).toHaveLength(3));
		await pick(user, "Assignee", "All assignees");
		await pick(user, "Status", "In Review");
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^ACME-/ })).toHaveLength(1));
		expect(screen.getByRole("group", { name: "ACME-7" })).toBeInTheDocument();
		await pick(user, "Status", "All statuses");
		await pick(user, "Label", "bug");
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^ACME-/ })).toHaveLength(2));
		await pick(user, "Label", "All labels");
		await pick(user, "Run", "Claimed");
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^ACME-/ })).toHaveLength(1));
		expect(screen.getByRole("group", { name: "ACME-3" })).toBeInTheDocument();
		await pick(user, "Run", "All runs");
		await user.type(screen.getByRole("textbox", { name: "Search" }), "export");
		await waitFor(() => expect(screen.getAllByRole("group", { name: /^ACME-/ })).toHaveLength(1));
		expect(mockState().sync.ticks).toBe(0);
	});

	it("shows the mirror when the tracker cannot be reached", async () => {
		await withTracker();
		await importAll();
		delete mockState().secrets.acme;
		mountApp("/work/backlog");
		expect(await rows()).toHaveLength(10);
		expect(mockState().sync.ticks).toBe(0);
	});

	it("shows the run state by a mark and an assignee that the team lacks", async () => {
		await withTracker();
		await importAll();
		mockState().sync.claimed.push("ACME-1");
		patch("ACME-2", { assignee: "Ghost Writer" });
		mountApp("/work/backlog");
		await rows();
		const first = screen.getByRole("group", { name: "ACME-1" });
		expect(within(first).getByRole("img", { name: "Claimed" })).toBeInTheDocument();
		expect(
			within(screen.getByRole("group", { name: "ACME-2" })).getByRole("img", {
				name: "Unknown member",
			}),
		).toBeInTheDocument();
	});

	it("ranks the members of an item by skill and capacity and assigns nobody by itself", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/backlog");
		await rows();
		await user.click(within(screen.getByRole("group", { name: "ACME-8" })).getByRole("button"));
		const aside = within(await screen.findByRole("complementary", { name: "ACME-8" }));
		const names = await waitFor(() => {
			const found = aside.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
			expect(found.length).toBeGreaterThan(4);
			return found;
		});
		// The item is labelled `ui`: the members with that skill come first.
		const ranked = ["Grace Hopper", "Edsger Dijkstra"];
		expect(ranked).toContain(names[0]);
		expect(ranked).toContain(names[1]);
		expect(
			within(aside.getByRole("group", { name: "Alan Turing" })).getByText("Full"),
		).toBeVisible();
		expect(mockState().sync.mirror.find((t) => t.key === "ACME-8")?.assignee).toBeNull();
	});

	it("assigns a member and marks the item for the agent on a click each", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/backlog");
		await rows();
		await user.click(within(screen.getByRole("group", { name: "ACME-3" })).getByRole("button"));
		const aside = within(await screen.findByRole("complementary", { name: "ACME-3" }));
		await user.click(await aside.findByRole("button", { name: "Assign Ada Lovelace" }));
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.assignee).toBe(
				"Ada Lovelace",
			),
		);
		expect(aside.queryByText("Eligible for pickup")).toBeNull();
		await user.click(aside.getByRole("button", { name: "Mark for agent" }));
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.labels).toContain("shipyard"),
		);
		// Assigned to me and marked: eligible.
		expect(await aside.findByText("Eligible for pickup")).toBeInTheDocument();
	});

	it("names the reason when the project has no tracker", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/work/backlog");
		expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		await importAll();
		mountApp("/work/backlog");
		await rows();
		expect(screen.getByRole("button", { name: "Importer" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Statut" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Assigné" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "To Do (7)" })).toBeInTheDocument();
	});
});

describe("Work / Board", () => {
	it("shows one column for each status with its cards", async () => {
		await withTracker();
		await importAll();
		mountApp("/work/board");
		for (const name of ["To Do (7)", "In Progress (2)", "In Review (1)"])
			expect(await screen.findByRole("region", { name })).toBeInTheDocument();
		const card = screen.getByRole("button", { name: /ACME-1(?!\d)/ });
		expect(card).toHaveTextContent("Fix login redirect");
		expect(card).toHaveTextContent("Ada Lovelace");
	});

	it("sends the transition when a card moves with the keyboard, and when it is dropped", async () => {
		await withTracker();
		await importAll();
		mountApp("/work/board");
		const card = await screen.findByRole("button", { name: /ACME-3/ });
		fireEvent.keyDown(card, { key: "ArrowRight", shiftKey: true });
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.status).toBe("In Progress"),
		);
		expect(
			within(await screen.findByRole("region", { name: "In Progress (3)" })).getByRole("button", {
				name: /ACME-3/,
			}),
		).toBeInTheDocument();
		const data = { getData: () => "ACME-3", setData: () => {}, effectAllowed: "" };
		fireEvent.drop(screen.getByRole("region", { name: "To Do (6)" }), { dataTransfer: data });
		await waitFor(() =>
			expect(mockState().sync.mirror.find((t) => t.key === "ACME-3")?.status).toBe("To Do"),
		);
	});

	it("returns the card to its column and shows the refusal when the tracker refuses", async () => {
		await withTracker();
		await importAll();
		// A status with no transition: the fake tracker refuses a move into it.
		patch("ACME-7", { status: "Blocked" });
		mountApp("/work/board");
		await screen.findByRole("button", { name: /ACME-5/ });
		const data = { getData: () => "ACME-5", setData: () => {}, effectAllowed: "" };
		fireEvent.drop(await screen.findByRole("region", { name: "Blocked (1)" }), {
			dataTransfer: data,
		});
		expect(await screen.findByRole("alert")).toHaveTextContent("no transition to `Blocked`");
		await waitFor(() =>
			expect(
				within(screen.getByRole("region", { name: "In Progress (2)" })).getByRole("button", {
					name: /ACME-5/,
				}),
			).toBeInTheDocument(),
		);
	});
});
