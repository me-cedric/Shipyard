import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const text = async (id: string) => (await unwrap(commands.workflowGet(id))).text;

let router: ReturnType<typeof mountApp> | undefined;
afterEach(() => waitFor(() => expect(router?.state.status ?? "idle").toBe("idle")));

/** Opens the recipe `id` as its chain of steps. The mock holds a proposal for `bug`, so pass `discard` to drop it first. */
async function open(id: string) {
	const user = userEvent.setup();
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	// The pick of Recipes is in the address: the page needs the router.
	router = mountApp("/crew/recipes");
	await user.click(
		await screen.findByRole("button", {
			name: new RegExp(`^${id.charAt(0).toUpperCase()}${id.slice(1)}`),
		}),
	);
	return user;
}

/** Opens the page of the step `name` from the chain of the open recipe. */
async function openStep(user: ReturnType<typeof userEvent.setup>, name: string) {
	const steps = await screen.findByRole("list", { name: "Steps" });
	await user.click(await within(steps).findByRole("link", { name }));
	await screen.findByRole("heading", { level: 1, name });
}

/** Goes back to the recipe and opens its text. */
async function openText(user: ReturnType<typeof userEvent.setup>, id: string) {
	// The page of a step has its own title; the way back is the link "Recipes".
	if (!screen.queryByRole("heading", { level: 1, name: "Crew" }))
		await user.click(screen.getByRole("link", { name: "Recipes" }));
	await user.click(await screen.findByRole("button", { name: "Edit as text" }));
	return (await screen.findByRole("textbox", { name: id })) as HTMLTextAreaElement;
}

const stepNames = () =>
	within(screen.getByRole("list", { name: "Steps" }))
		.getAllByRole("link")
		.map((l) => l.textContent);

describe("Workflows: the form", () => {
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("a change of effort on the page of a step shows in the text", async () => {
		const user = await open("spike");
		await openStep(user, "Grill");
		const who = within(screen.getByRole("region", { name: "Who" }));
		await user.click(who.getByRole("combobox", { name: "Effort" }));
		await user.click(await screen.findByRole("option", { name: "Max" }));
		const editor = await openText(user, "spike");
		await waitFor(() => expect(editor.value).toContain("effort: max"));
		expect(editor.value.startsWith("# A spike")).toBe(true);
		await user.click(screen.getByRole("button", { name: "Show the steps" }));
		await waitFor(() => expect(stepNames()).toEqual(["Grill", "Investigate", "Report"]));
	});

	it("adds a step, moves it up and saves it", async () => {
		const user = await open("spike");
		await user.click(await screen.findByRole("button", { name: "Add a step" }));
		await openStep(user, "Step 4");
		await user.click(screen.getByRole("button", { name: "Move up" }));
		await user.click(screen.getByRole("link", { name: "Recipes" }));
		await waitFor(() => expect(stepNames()).toEqual(["Grill", "Investigate", "Step 4", "Report"]));
		const save = screen.getByRole("button", { name: "Save" });
		await waitFor(() => expect(save).toBeEnabled());
		await user.click(save);
		await waitFor(async () => expect(await text("spike")).toContain("id: step-4"));
	});

	it("an unknown need blocks the save", async () => {
		const user = await open("spike");
		const editor = await openText(user, "spike");
		fireEvent.change(editor, {
			target: { value: editor.value.replace("needs: [grill]", "needs: [gone]") },
		});
		expect(await screen.findByRole("alert")).toHaveTextContent("needs `gone`");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		// The text with an issue cannot open as steps.
		await user.click(screen.getByRole("button", { name: "Show the steps" }));
		expect(screen.getByRole("textbox", { name: "spike" })).toBeInTheDocument();
	});

	it("the turn limit writes max_turns when on", async () => {
		const user = await open("spike");
		await openStep(user, "Grill");
		await user.click(await screen.findByRole("switch", { name: "Most turns" }));
		const editor = await openText(user, "spike");
		await waitFor(() => expect(editor.value).toContain("max_turns: 40"));
	});

	it("the budget is off with no budget_usd and writes it when on", async () => {
		const user = await open("feature");
		await openStep(user, "Grill");
		const budget = await screen.findByRole("switch", { name: "Budget of the recipe" });
		expect(budget).not.toBeChecked();
		await user.click(budget);
		const editor = await openText(user, "feature");
		await waitFor(() => expect(editor.value).toContain("budget_usd: 5"));
	});

	it("the page of a step shows each field in its card, with no More and no id field", async () => {
		const user = await open("spike");
		await openStep(user, "Grill");
		for (const name of ["Who", "Limits", "People", "How it works"])
			expect(screen.getByRole("region", { name })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "More" })).toBeNull();
		expect(screen.queryByRole("textbox", { name: "Step id" })).toBeNull();
		const limits = within(screen.getByRole("region", { name: "Limits" }));
		await user.click(limits.getByRole("button", { name: "Tries after a failure, more" }));
		const editor = await openText(user, "spike");
		await waitFor(() => expect(editor.value).toContain("retry: 1"));
	});

	// Picture 080: a step is a page with its own address, a way back and its place in the recipe.
	it("opens a step from its address, and a new name follows into the address and the text", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		router = mountApp("/crew/recipes?recipe=feature&step=build");
		expect(await screen.findByRole("heading", { level: 1, name: "Build" })).toBeInTheDocument();
		expect(screen.getByText("Step 3 of the Feature recipe")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Recipes" })).toHaveAttribute(
			"href",
			"/crew/recipes?recipe=feature",
		);
		// The needs and the tools are chips: a chip removes its id, and Add lists the others.
		const how = within(screen.getByRole("region", { name: "How it works" }));
		expect(how.getByRole("button", { name: "Remove Plan" })).toBeInTheDocument();
		const name = screen.getByRole("textbox", { name: "Name of the step" });
		await user.clear(name);
		await user.type(name, "Make it{Enter}");
		expect(await screen.findByRole("heading", { level: 1, name: "Make it" })).toBeInTheDocument();
		await waitFor(() => expect(router?.state.location.search).toMatchObject({ step: "make-it" }));
		const editor = await openText(user, "feature");
		await waitFor(() => expect(editor.value).toContain("id: make-it"));
		// The step that needed it follows the new id.
		expect(editor.value).toContain("needs: [make-it]");
	});

	it("shows the recipe as a chain: the agent, the model in words and the wait for a person", async () => {
		await open("feature");
		const steps = within(await screen.findByRole("list", { name: "Steps" }));
		const plan = within(steps.getByRole("link", { name: "Plan" }).closest("li") as HTMLElement);
		expect(plan.getByText("Planner")).toBeInTheDocument();
		expect(plan.getByText("Strong model")).toBeInTheDocument();
		expect(plan.getByText("Waits for a person")).toBeInTheDocument();
		expect(plan.getByText("You review the plan")).toBeInTheDocument();
		// The step that opens the pull request asks first until a person says "Do not ask again".
		const pr = within(
			steps.getByRole("link", { name: "Pull request" }).closest("li") as HTMLElement,
		);
		expect(pr.getByText("Asks first")).toBeInTheDocument();
	});

	it("lists a recipe by its name with its count of steps, and its file actions are buttons", async () => {
		const user = await open("spike");
		const row = screen.getByRole("button", { name: /^Spike/ });
		expect(row).toHaveAttribute("aria-current", "true");
		expect(row).toHaveTextContent("3 steps");
		const card = within(await screen.findByRole("region", { name: "Spike" }));
		expect(card.getByRole("heading", { name: "Spike" })).toBeInTheDocument();
		for (const name of ["Rename", "Duplicate", "Delete"])
			expect(card.getByRole("button", { name })).toBeEnabled();
		// The id shows with the text of the file, with its copy control.
		expect(card.queryByText("spike")).toBeNull();
		await openText(user, "spike");
		expect(card.getByText("spike")).toBeInTheDocument();
		expect(card.getByRole("button", { name: "Copy ref" })).toBeInTheDocument();
		await user.click(card.getByRole("button", { name: "Duplicate" }));
		expect(await screen.findByRole("dialog", { name: "Duplicate" })).toBeInTheDocument();
	});

	it("shows the reason on Duplicate, Rename and Delete for a viewer", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		await open("spike");
		const card = within(await screen.findByRole("region", { name: "Spike" }));
		for (const name of ["Duplicate", "Rename", "Delete"]) {
			const button = card.getByRole("button", { name });
			await waitFor(() => expect(button).toBeDisabled());
			expect(button).toHaveAccessibleDescription(
				"Needs the right project.settings (your role: Viewer)",
			);
		}
	});

	it("delete asks first and refuses the default workflow", async () => {
		const user = await open("feature");
		// Another part of the app can hold a "Delete" too: the one of the recipe is in its card.
		const card = within(await screen.findByRole("region", { name: "Feature" }));
		await user.click(await card.findByRole("button", { name: "Delete" }));
		expect(await unwrap(commands.workflowsList())).toHaveLength(7);
		await user.click(card.getByRole("button", { name: "Delete Feature" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("default recipe");
		expect(await unwrap(commands.workflowsList())).toHaveLength(7);
	});

	it("applies a proposal from its diff", async () => {
		const user = await open("bug");
		const card = within(await screen.findByRole("region", { name: "Proposed change" }));
		await user.click(card.getByRole("button", { name: "Show the change" }));
		expect(await screen.findByRole("dialog", { name: "Proposed change" })).toHaveTextContent(
			"budget_usd: 2",
		);
		await user.keyboard("{Escape}");
		await user.click(card.getByRole("button", { name: "Apply" }));
		await waitFor(async () => expect(await text("bug")).toContain("budget_usd: 2"));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Apply" })).toBeNull());
	});
	it("shows the proposal card under the list on another recipe, named for its recipe", async () => {
		await open("feature");
		const card = within(await screen.findByRole("region", { name: "Proposed change" }));
		expect(card.getByRole("heading", { name: "An agent proposes a change to Bug" })).toBeVisible();
		expect(screen.getByRole("button", { name: "New recipe" })).toBeVisible();
	});

	it("May write of the pull request step shows Asks first, or Alone with a way back to Asks first", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().sync.file = "valid";
		mockState().sync.automation.recipe_writes = { feature: ["open_pr"] };
		const user = await open("feature");
		await openStep(user, "Pull request");
		await user.click(await screen.findByRole("button", { name: "Asks first" }));
		await waitFor(() => expect(mockState().sync.automation.recipe_writes).toBeUndefined());
		// Asks first is the state: it shows as a word, with no way to widen it here.
		await waitFor(() => expect(screen.queryByRole("button", { name: "Alone" })).toBeNull());
		expect(screen.getByText("Asks first")).toBeInTheDocument();
	});

	// spec:app-redesign#REQ-016: the permissions of "Do not ask again" are a part of the recipe.
	it("shows the permissions of a recipe and removes one", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().sync.file = "valid";
		mockState().sync.automation.recipe_writes = {
			feature: ["transition", "open_pr"],
			bug: ["push"],
		};
		const user = await open("feature");
		const part = within(await screen.findByRole("region", { name: "Writes without a question" }));
		expect(part.getByText("Move the ticket")).toBeInTheDocument();
		expect(part.getByText("Open a pull request")).toBeInTheDocument();
		// The permissions of another recipe do not show here.
		expect(part.queryByText("Push")).toBeNull();
		await user.click(part.getByRole("button", { name: "Remove Open a pull request for feature" }));
		// The file is shared with the team: the removal asks first, and saves on the answer.
		expect(mockState().sync.automation.recipe_writes?.feature).toEqual(["transition", "open_pr"]);
		await user.click(
			part.getByRole("button", { name: "Remove Open a pull request for the whole team?" }),
		);
		await waitFor(() =>
			expect(mockState().sync.automation.recipe_writes).toEqual({
				feature: ["transition"],
				bug: ["push"],
			}),
		);
		await waitFor(() => expect(part.queryByText("Open a pull request")).toBeNull());
	});

	it("shows no permissions part on a recipe that has none, and Remove needs project.settings", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		mockState().sync.file = "valid";
		mockState().sync.automation.recipe_writes = { feature: ["push"] };
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const user = await open("spike");
		await screen.findByRole("list", { name: "Steps" });
		expect(screen.queryByRole("region", { name: "Writes without a question" })).toBeNull();
		await user.click(screen.getByRole("button", { name: /^Feature/ }));
		const remove = await screen.findByRole("button", { name: "Remove Push for feature" });
		await waitFor(() => expect(remove).toBeDisabled());
		expect(remove).toHaveAccessibleDescription(
			"Needs the right project.settings (your role: Viewer)",
		);
	});
});
