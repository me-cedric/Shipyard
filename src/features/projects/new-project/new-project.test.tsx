import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const CREATE = "Create the project";

const openCreator = async () => {
	const user = userEvent.setup();
	const router = mountApp("/home/today");
	await user.click(await screen.findByRole("button", { name: "Continue" }));
	await user.click(await screen.findByRole("button", { name: "Create a project" }));
	await user.type(await screen.findByRole("textbox", { name: "Name" }), "Demo");
	return { user, router };
};
const stepTo = (user: ReturnType<typeof userEvent.setup>, name: string) =>
	user.click(
		within(screen.getByRole("navigation", { name: "Steps" })).getByRole("button", { name }),
	);

describe("new project", () => {
	beforeEach(() => localStorage.removeItem("shipyard.cloneFolder"));

	it("is a bare page with its own address, one question for each step and a way back", async () => {
		const { user, router } = await openCreator();
		expect(router.state.location.pathname).toBe("/projects/new");
		// A bare page: no rail, no top row, no dialog.
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("navigation", { name: "Sidebar" })).toBeNull();
		expect(screen.queryByRole("combobox", { name: "Ask or tell Shipyard" })).toBeNull();
		const steps = within(screen.getByRole("navigation", { name: "Steps" })).getAllByRole("button");
		expect(steps.map((b) => b.textContent)).toEqual([
			"1Name",
			"2Technology",
			"3Tools",
			"4Team",
			"5Ready",
		]);
		for (const b of steps) expect(b).toHaveClass("min-h-control");
		expect(steps[0]).toHaveAttribute("aria-current", "step");
		const go = screen.getByRole("button", { name: "Continue" });
		expect(go).toHaveClass("min-h-13", "min-w-55", "bg-primary");
		await user.click(go);
		const question = screen.getByRole("heading", {
			level: 1,
			name: "Which technology do you use?",
		});
		await waitFor(() => expect(question).toHaveFocus());
		// The stacks of the app and Something else, as tiles. The first stack is the choice.
		const kinds = within(screen.getByRole("group", { name: "Technology" })).getAllByRole("button");
		expect(kinds.map((b) => b.textContent)).toEqual([
			"Node",
			"Rust",
			"Python",
			"Java",
			"Go",
			"Something else",
		]);
		expect(kinds[0]).toHaveAttribute("aria-pressed", "true");
		await user.click(screen.getByRole("button", { name: "Rust" }));
		expect(screen.getByRole("button", { name: "Rust", pressed: true })).toBeInTheDocument();
		// Back goes one step back, then to the page before.
		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Demo");
		await user.click(screen.getByRole("button", { name: "Back" }));
		await waitFor(() => expect(router.state.location.pathname).not.toBe("/projects/new"));
		expect(mockState().projects).toHaveLength(0);
	});

	it("asks for a name before the next step", async () => {
		const user = userEvent.setup();
		const router = mountApp("/projects/new");
		expect(await screen.findByRole("button", { name: "Continue" })).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Demo{Enter}");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Which technology do you use?" }),
		).toBeVisible();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("is not a view of the open project: a start does not open on it", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const router = mountApp("/code/now");
		await screen.findByRole("main");
		// The view memory skips the first path of a project: the second one is the first write.
		router.history.push("/code/history");
		await waitFor(() => expect(mockState().projects[0]?.lastView).toBe("/code/history"));
		router.history.push("/projects/new");
		await screen.findByRole("navigation", { name: "Steps" });
		await waitFor(() => expect(router.state.status).toBe("idle"));
		expect(mockState().projects[0]?.lastView).toBe("/code/history");
	});

	it("creates at the last step only, and offers only the start that can run", async () => {
		const { user } = await openCreator();
		expect(screen.queryByRole("button", { name: CREATE })).toBeNull();
		await stepTo(user, "Ready");
		await waitFor(() => expect(screen.getByRole("button", { name: CREATE })).toBeEnabled());
		expect(screen.getByRole("button", { name: "Start an agent" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Create the tickets" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Later", pressed: true })).toBeInTheDocument();
		// The files open on demand: the row gives their count.
		expect(screen.queryByRole("button", { name: "docs/brief.md" })).toBeNull();
		const files = screen.getByRole("group", { name: "Files that Shipyard writes" });
		expect(files).toHaveTextContent(/^Files that Shipyard writes\d+ filesRead them$/);
		await user.click(within(files).getByRole("button", { name: "Read them" }));
		await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(3));
		await user.click(screen.getByRole("button", { name: "docs/brief.md" }));
		expect(screen.getByRole("textbox", { name: "Text of docs/brief.md" })).toHaveDisplayValue(
			/## Scope/,
		);
	});

	it("the Tools button under Needs a code host goes to the Tools step, or to its card in All steps", async () => {
		const { user } = await openCreator();
		await stepTo(user, "Ready");
		await user.click((await screen.findAllByRole("button", { name: "Tools" }))[0] as HTMLElement);
		expect(
			within(screen.getByRole("navigation", { name: "Steps" })).getByRole("button", {
				name: "Tools",
			}),
		).toHaveAttribute("aria-current", "step");
		await user.click(screen.getByRole("button", { name: "All steps" }));
		await screen.findByRole("region", { name: "Where the code lives" });
		const scroll = vi.fn();
		(document.getElementById("creator-remote") as HTMLElement).scrollIntoView = scroll;
		await user.click((await screen.findAllByRole("button", { name: "Tools" }))[0] as HTMLElement);
		expect(scroll).toHaveBeenCalled();
		expect(document.getElementById("creator-remote")).toHaveFocus();
	});

	it("shows the five steps on one page with All steps, and one step again after Back", async () => {
		const { user, router } = await openCreator();
		expect(screen.queryByRole("textbox", { name: "Vision" })).toBeNull();
		const all = screen.getByRole("button", { name: "All steps" });
		// The large button: 52 px high.
		expect(all).toHaveClass("min-h-13");
		await user.click(all);
		await waitFor(() => expect(router.state.location.search).toEqual({ all: true }));
		expect(screen.getByRole("heading", { level: 1, name: "New project" })).toBeVisible();
		expect(screen.getByRole("img", { name: "Steps" })).toBeVisible();
		for (const name of ["Project", "Brief", "Team", "Where the code lives", "Start"]) {
			expect(screen.getByRole("heading", { level: 2, name: `${name}` })).toBeInTheDocument();
			expect(screen.getByRole("region", { name })).toBeInTheDocument();
		}
		// Each field of each step is there, with the text that the person typed.
		expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Demo");
		expect(screen.getByRole("textbox", { name: "Short key for tickets" })).toHaveValue("DEMO");
		expect(await screen.findByDisplayValue("/mock/Projects")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Choose a folder" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Node", pressed: true })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Vision" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Language of pull requests" })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Member 1" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Issue tracker" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
		// No code host is connected: the repository has two choices, and the row says what is missing.
		expect(
			// The row and its choice share the name: the choice is the inner group.
			within(screen.getAllByRole("group", { name: "Repository" }).at(-1) as HTMLElement)
				.getAllByRole("button")
				.map((r) => r.textContent),
		).toEqual(["Only on this computer", "Existing"]);
		expect(screen.getAllByText("Needs a code host").length).toBeGreaterThan(0);
		expect(screen.getByRole("button", { name: "Add a code host" })).toHaveClass("min-h-control");
		await waitFor(() => expect(screen.getByRole("button", { name: CREATE })).toBeEnabled());
		await user.click(screen.getByRole("button", { name: "Back" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		await stepTo(user, "Team");
		expect(screen.queryByRole("textbox", { name: "Vision" })).toBeNull();
		expect(screen.getByRole("textbox", { name: "Member 1" })).toBeInTheDocument();
	});

	it("adds and removes a member, and keeps the first one", async () => {
		const { user } = await openCreator();
		await stepTo(user, "Team");
		expect(await screen.findByRole("textbox", { name: "Member 1" })).toHaveValue("Ada Lovelace");
		const team = within(screen.getByRole("group", { name: "Who is in the team?" }));
		const own = team.getByRole("button", { name: "Remove Ada Lovelace" });
		expect(own).toBeDisabled();
		expect(own).toHaveAccessibleDescription("A project starts with one person");
		await user.click(screen.getByRole("button", { name: "Add a member" }));
		await user.type(screen.getByRole("textbox", { name: "Member 2" }), "Grace");
		const remove = team.getByRole("button", { name: "Remove Grace" });
		expect(remove).toHaveClass("min-h-control");
		await user.click(remove);
		expect(screen.queryByRole("textbox", { name: "Member 2" })).toBeNull();
	});

	it("fills the brief in the docs language until the person edits a field", async () => {
		const { user } = await openCreator();
		await user.click(screen.getByRole("button", { name: "All steps" }));
		const scope = await screen.findByRole("textbox", { name: "Scope" });
		await waitFor(() => expect(scope).toHaveDisplayValue(/Set up the Node\.js/));
		await user.clear(scope);
		await user.type(scope, "One line");
		await user.click(screen.getByRole("combobox", { name: "Language of the docs" }));
		await user.click(await screen.findByRole("option", { name: "French" }));
		await waitFor(() =>
			expect(screen.getByRole("textbox", { name: "Vision" })).toHaveDisplayValue(
				/aide ses utilisateurs/,
			),
		);
		expect(scope).toHaveValue("One line");
	});

	it("creates the starter issues only after the click on Create issues", async () => {
		await unwrap(
			commands.connectionsAdd({
				name: "Acme",
				group: "tracker",
				kind: "linear",
				url: "",
				user: null,
			}),
		);
		const create = vi.spyOn(commands, "workItemCreate");
		const { user } = await openCreator();
		await stepTo(user, "Tools");
		await user.click(screen.getByRole("combobox", { name: "Issue tracker" }));
		await user.click(await screen.findByRole("option", { name: "Acme" }));
		await stepTo(user, "Ready");
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Create the tickets", pressed: true }),
			).toBeInTheDocument(),
		);
		// The first tickets show before Create: a removed one is not made.
		expect(
			await screen.findByRole("group", { name: "Set up the Node.js project and its checks" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Remove Add continuous integration" }));
		await waitFor(() =>
			expect(screen.queryByRole("group", { name: "Add continuous integration" })).toBeNull(),
		);
		await waitFor(() => expect(screen.getByRole("button", { name: CREATE })).toBeEnabled());
		await user.click(screen.getByRole("button", { name: CREATE }));
		const first = await screen.findByRole("textbox", { name: "Issue 1" });
		expect(first).toHaveValue("Set up the Node.js project and its checks");
		expect(screen.getAllByRole("textbox", { name: /^Issue \d$/ })).toHaveLength(3);
		expect(create).not.toHaveBeenCalled();
		expect(mockState().projects[0]).toMatchObject({ name: "Demo", path: "/mock/Projects/demo" });
		await user.click(
			screen.getByRole("button", { name: "Remove Write the getting started guide" }),
		);
		await user.click(screen.getByRole("button", { name: "Create issues" }));
		await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
		expect(await screen.findByText("2 issues created")).toBeInTheDocument();
		create.mockRestore();
	});
});
