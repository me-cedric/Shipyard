import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { askForm } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

/** The mock mirror lacks a ticket that the tracker just made: the fake ticket keeps its key. */
const FREE = "ACME-8";
const MADE = FREE;

async function open(
	role?: "viewer",
	at = "/flow/new",
	rights: ("work.edit" | "specs.edit")[] = [],
) {
	vi.spyOn(commands, "workItemCreate").mockResolvedValue({
		status: "ok",
		data: { reference: "est:new#x", action: "create", key: MADE, error: null, skipped: [] },
	});
	await withTracker();
	await importAll();
	// Every ticket of the mock has a run: this one has none.
	const state = mockState().factory;
	state.runs = state.runs.filter((r) => r.key !== FREE);
	if (role)
		mockState().person = {
			member: "bo",
			found: "email",
			role,
			admin: false,
			readOnly: false,
			rights,
		};
	const router = mountApp(at);
	await screen.findByRole("button", { name: `Start an agent ${FREE}` });
	return router;
}
const type = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
	await user.type(screen.getByRole("textbox", { name: "Title" }), text);
};
const create = (user: ReturnType<typeof userEvent.setup>) =>
	user.click(screen.getByRole("button", { name: "Create" }));

describe("Flow / New feature", () => {
	afterEach(() => vi.restoreAllMocks());

	it("opens at /flow/new with the focus in the title field", async () => {
		const router = await open();
		expect(router.state.location.pathname).toBe("/flow/new");
		expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("has a back link to Flow, pills for the kind and a recipe by its name", async () => {
		await open();
		expect(screen.getByRole("link", { name: "Flow" })).toHaveAttribute("href", "/flow/flow");
		expect(screen.getByRole("button", { name: "Feature" })).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: "An agent writes the spec" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		const recipe = screen.getByRole("combobox", { name: "Recipe" });
		expect(recipe.textContent).toMatch(/^[A-Z]/);
	});

	it("puts the focus in Find a ticket when Get started asks for a run", async () => {
		askForm("run");
		await open();
		await waitFor(() =>
			expect(screen.getByRole("combobox", { name: "Find a ticket" })).toHaveFocus(),
		);
	});

	it("An agent writes the spec: makes the change first, then a ticket that cites it, then delegates", async () => {
		const user = userEvent.setup();
		const item = vi.spyOn(commands, "workItemCreate");
		const make = vi.spyOn(commands, "specsChangeCreate");
		const change = vi.spyOn(commands, "specsChangeFromTicket");
		const delegate = vi.spyOn(commands, "specsChangeDelegate");
		await open();
		await type(user, "Export report");
		await create(user);
		await waitFor(() => expect(delegate).toHaveBeenCalled());
		expect(make).toHaveBeenCalledWith("Export report");
		expect(item).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Export report", reference: "change:export-report" }),
			true,
		);
		expect(change).not.toHaveBeenCalled();
		expect(delegate.mock.calls[0]?.[1]).toBeTruthy();
	});

	it("I write the spec: makes a change and no ticket", async () => {
		const user = userEvent.setup();
		const item = vi.spyOn(commands, "workItemCreate");
		const make = vi.spyOn(commands, "specsChangeCreate");
		const run = vi.spyOn(commands, "runStart");
		await open();
		await user.click(screen.getByRole("button", { name: "I write the spec" }));
		expect(screen.queryByRole("combobox", { name: "Recipe" })).toBeNull();
		await type(user, "Export report");
		await create(user);
		await waitFor(() => expect(make).toHaveBeenCalledWith("Export report"));
		expect(item).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it("Build now, no spec: makes the change, the ticket from its ref and the run", async () => {
		const user = userEvent.setup();
		const item = vi.spyOn(commands, "workItemCreate");
		const make = vi.spyOn(commands, "specsChangeCreate");
		const run = vi.spyOn(commands, "runStart");
		const change = vi.spyOn(commands, "specsChangeFromTicket");
		await open();
		await user.click(screen.getByRole("button", { name: "Build now, no spec" }));
		await type(user, "Export report");
		await create(user);
		await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
		expect(make).toHaveBeenCalledWith("Export report");
		expect(item).toHaveBeenCalledTimes(1);
		expect(item.mock.calls[0]?.[0].reference).toBe("change:export-report");
		expect(change).not.toHaveBeenCalled();
	});

	it("puts the kind on the ticket as a label when a ticket is made", async () => {
		const user = userEvent.setup();
		const label = vi.spyOn(commands, "workTicketLabelAdd");
		await open();
		await user.click(screen.getByRole("button", { name: "Bug" }));
		await type(user, "Chart breaks");
		await create(user);
		await waitFor(() => expect(label).toHaveBeenCalledWith(expect.any(String), "bug", true));
	});

	it("Idea for later makes the change only: no ticket, no label, no run", async () => {
		const user = userEvent.setup();
		const make = vi.spyOn(commands, "specsChangeCreate");
		const item = vi.spyOn(commands, "workItemCreate");
		const label = vi.spyOn(commands, "workTicketLabelAdd");
		const run = vi.spyOn(commands, "runStart");
		await open();
		await user.click(screen.getByRole("button", { name: "Idea for later" }));
		expect(screen.getByRole("button", { name: "Idea for later" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.queryByRole("button", { name: "I write the spec" })).toBeNull();
		await type(user, "Dark charts");
		await create(user);
		await waitFor(() => expect(make).toHaveBeenCalledWith("Dark charts"));
		expect(item).not.toHaveBeenCalled();
		expect(label).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it("opens with the kind Idea when the address says so", async () => {
		await open(undefined, "/flow/new?kind=idea");
		expect(screen.getByRole("button", { name: "Idea for later" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("gates the kind Idea on specs.edit, the right of the command that it calls", async () => {
		await open("viewer", "/flow/new?kind=idea", ["work.edit"]);
		const user = userEvent.setup();
		await type(user, "Dark charts");
		await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeDisabled());
		vi.restoreAllMocks();
		cleanup();
		await open("viewer", "/flow/new?kind=idea", ["specs.edit"]);
		await type(user, "Dark charts");
		await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeEnabled());
	});

	it("starts an agent on a ticket from the list", async () => {
		const user = userEvent.setup();
		const run = vi.spyOn(commands, "runStart");
		await open();
		await user.click(screen.getByRole("button", { name: `Start an agent ${FREE}` }));
		await waitFor(() => expect(run).toHaveBeenCalledWith(FREE));
	});

	it("refuses a ticket with a live run, names it and opens that run", async () => {
		const user = userEvent.setup();
		const run = vi.spyOn(commands, "runStart");
		await open();
		expect(document.querySelector('datalist option[label="ACME-2"]')).toBeNull();
		await user.type(screen.getByRole("combobox", { name: "Find a ticket" }), "ACME-2");
		await user.click(screen.getByRole("button", { name: "Start an agent" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("A run is active on ACME-2.");
		expect(run).not.toHaveBeenCalled();
		await user.click(within(alert).getByRole("button", { name: "Open the run" }));
		expect(await screen.findByRole("region", { name: "ACME-2" })).toBeVisible();
	});

	it("shows an error line when a command fails", async () => {
		const user = userEvent.setup();
		vi.spyOn(commands, "specsChangeCreate").mockRejectedValue(new Error("Refused for a test"));
		await open();
		await user.click(screen.getByRole("button", { name: "I write the spec" }));
		await type(user, "Export report");
		await create(user);
		expect(await screen.findByText(/Refused for a test/)).toBeVisible();
	});

	it("turns Create and Start an agent off for a viewer", async () => {
		await open("viewer");
		const user = userEvent.setup();
		await type(user, "Export report");
		await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).toBeDisabled());
		expect(screen.getByRole("button", { name: `Start an agent ${FREE}` })).toBeDisabled();
	});
});
