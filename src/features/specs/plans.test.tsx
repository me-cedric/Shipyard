import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { Coverage } from "./coverage";
import { TestPlans } from "./index";
import { renderSpecs } from "./test-harness";

const files = () => mockState().specs.files;
const PLAN = "docs/delivery/test-plans/auth-login.feature";
const title = (name: string) => screen.findByRole("heading", { name, level: 1 });

describe("Library / Test plans", () => {
	it("opens on one plan: each scenario is a card with its last result", async () => {
		await renderSpecs(<TestPlans />);
		expect(await title("Test plan: Login")).toBeVisible();
		const page = within(await screen.findByRole("article", { name: "Login" }));
		expect(page.getAllByRole("heading")).toHaveLength(3);
		expect(page.getAllByText("they act")).toHaveLength(3);
		const card = (name: string) => page.getByRole("heading", { name }).parentElement;
		await waitFor(() => expect(card("A session starts")).toHaveTextContent("Pass"));
		expect(card("A person signs in")).toHaveTextContent("Fail");
		expect(card("An old rule")).toHaveTextContent("Not run");
		expect(screen.getByText("The text has no errors")).toHaveRole("status");
	});

	it("lists the requirements of the plan, each with the state that its scenarios give", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		const reqs = within(await screen.findByRole("region", { name: "Requirements" }));
		expect(await reqs.findByRole("button", { name: /Keep a session.*Tested/ })).toBeVisible();
		expect(reqs.getByRole("button", { name: /Login.*Fail/ })).toBeVisible();
		expect(reqs.getByRole("button", { name: /Sign out.*No test yet/ })).toBeVisible();
		await user.click(reqs.getByRole("button", { name: /Keep a session/ }));
		await waitFor(() =>
			expect(screen.getByRole("status", { name: "Inspector" })).toHaveTextContent(
				"spec:auth#REQ-001",
			),
		);
	});

	it("opens another plan from the card of the other test plans", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		const others = within(await screen.findByRole("region", { name: "Other test plans" }));
		await user.click(others.getByRole("button", { name: "Invoice" }));
		expect(await title("Test plan: Invoice")).toBeVisible();
		expect(
			within(await screen.findByRole("article", { name: "Invoice" })).getAllByRole("heading"),
		).toHaveLength(2);
	});

	it("links to What is tested", async () => {
		await renderSpecs(<TestPlans />);
		expect(await screen.findByRole("link", { name: "What is tested" })).toHaveAttribute(
			"href",
			"/library/test-plans/coverage",
		);
	});

	it("flags a citation that no spec holds", async () => {
		await renderSpecs(<TestPlans />);
		const broken = await screen.findByRole("list", { name: "Broken citations" });
		expect(within(broken).getByRole("button", { name: /spec:auth#REQ-009.*Broken/ })).toBeVisible();
	});

	it("opens a plan as scenarios to read, and a switch shows the text (spec:app-redesign#REQ-021)", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await screen.findByRole("article", { name: "Login" });
		expect(screen.queryByRole("textbox", { name: "Login" })).toBeNull();
		// The findings of the saved file stay beside the page.
		expect(screen.getByRole("list", { name: "Broken citations" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Text" }));
		expect(await screen.findByRole("textbox", { name: "Login" })).toHaveValue(
			files()[PLAN]?.text ?? "",
		);
	});

	it("opens the text at the scenario for Edit, and at its end for a new scenario", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await user.click(await screen.findByRole("button", { name: "Edit: A person signs in" }));
		expect(await screen.findByRole("textbox", { name: "Login" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Read" }));
		await user.click(await screen.findByRole("button", { name: "Add a scenario" }));
		const box = (await screen.findByRole("textbox", { name: "Login" })) as HTMLTextAreaElement;
		await waitFor(() => expect(box).toHaveFocus());
		expect(box.selectionStart).toBe(box.value.length);
	});

	it("opens a new plan in its text: it has no scenario to read", async () => {
		files()[PLAN] = { text: "Feature: Login\n", stamp: "s1" };
		await renderSpecs(<TestPlans />);
		expect(await screen.findByRole("textbox", { name: "Login" })).toBeVisible();
		// No page to read: the Read / Text switch would do nothing.
		expect(screen.queryByRole("button", { name: "Read" })).toBeNull();
	});

	it("shows the tags of a scenario on its card, with the tags of its feature", async () => {
		files()[PLAN] = {
			text: "@smoke\nFeature: Login\n\n  @spec:auth#REQ-001\n  Scenario: A session starts\n    Given a person\n    Then it works\n\n  Scenario: Other\n    Then it works\n",
			stamp: "s1",
		};
		await renderSpecs(<TestPlans />);
		const read = within(await screen.findByRole("article", { name: "Login" }));
		expect(read.getAllByText("smoke")).toHaveLength(2);
		// The tag of a requirement shows the name of the requirement.
		expect(await read.findByText("Keep a session")).toBeVisible();
	});

	it("shows the text at each click on an error line, and keeps the stored Read choice", async () => {
		const user = userEvent.setup();
		files()[PLAN] = { text: "Scenario: no feature\n  Then it works\n", stamp: "s1" };
		await renderSpecs(<TestPlans />);
		// The list mounts again with each form: find the line each time.
		const line = async () =>
			within(await screen.findByRole("list", { name: "Syntax errors" })).getByRole("button", {
				name: /Line 1/,
			});
		expect(await screen.findByRole("article")).toBeVisible();
		expect(screen.getByText("Errors in the text: 1")).toHaveRole("status");
		await user.click(await line());
		expect(await screen.findByRole("textbox")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Read" }));
		expect(await screen.findByRole("article")).toBeVisible();
		await user.click(await line());
		expect(await screen.findByRole("textbox")).toBeVisible();
		expect(JSON.stringify({ ...localStorage })).not.toContain("edit");
	});

	it("reports a syntax error with its line after a save", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await user.click(await screen.findByRole("button", { name: "Text" }));
		const box = await screen.findByRole("textbox", { name: "Login" });
		await waitFor(() => expect(box).toHaveValue(files()[PLAN]?.text ?? ""));
		await user.clear(box);
		await user.type(box, "Scenario: no feature");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const list = await screen.findByRole("list", { name: "Syntax errors" });
		expect(within(list).getByText("Line 1")).toBeVisible();
		expect(files()[PLAN]?.text).toBe("Scenario: no feature");
	});

	it("creates a plan from a name, behind More", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await title("Test plan: Login");
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "New test plan" }));
		await user.type(screen.getByRole("textbox", { name: "Plan" }), "Export plan");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() =>
			expect(files()["docs/delivery/test-plans/export-plan.feature"]?.text).toBe(
				"Feature: Export plan\n",
			),
		);
		expect(await title("Test plan: Export plan")).toBeVisible();
	});
});

describe("Library / What is tested", () => {
	const card = async (name: string) => within(await screen.findByRole("region", { name }));

	it("groups the requirements by the state of their tests, with a count for each state", async () => {
		await renderSpecs(<Coverage />);
		expect(await title("What is tested")).toBeVisible();
		expect(screen.getByRole("link", { name: "Test plans" })).toHaveAttribute(
			"href",
			"/library/test-plans",
		);
		const passing = await card("Passing");
		expect(await passing.findByRole("button", { name: /Keep a session.*auth/ })).toBeVisible();
		expect(passing.getByRole("heading")).toHaveTextContent("Passing1");
		const failing = await card("Failing");
		expect(failing.getByRole("button", { name: /Login.*auth/ })).toBeVisible();
		expect(failing.getByRole("heading")).toHaveTextContent("Failing1");
		expect((await card("Not covered")).getByRole("button", { name: /Sign out/ })).toBeVisible();
		expect((await card("Partial")).getByRole("heading")).toHaveTextContent("Partial0");
		expect((await card("Blocked")).getByRole("heading")).toHaveTextContent("Blocked0");
		// No ref token on the page.
		expect(screen.queryByText(/spec:auth/)).toBeNull();
		expect(screen.getByText(/^Last run /)).toBeVisible();
	});

	it("filters the cards by a state", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Coverage />);
		await card("Passing");
		const show = within(screen.getByRole("group", { name: "Show" }));
		await user.click(show.getByRole("button", { name: "Failing" }));
		expect(await card("Failing")).toBeDefined();
		expect(screen.queryByRole("region", { name: "Passing" })).toBeNull();
		expect(screen.queryByRole("region", { name: "Check of the scenarios" })).toBeNull();
		await user.click(show.getByRole("button", { name: "All" }));
		expect(await card("Passing")).toBeDefined();
	});

	it("names each check of the scenarios, and a finding opens its plan at the line", async () => {
		const user = userEvent.setup();
		files()[PLAN] = {
			text: "Feature: Login\n  Scenario: weak\n    When a person signs in\n",
			stamp: "s1",
		};
		await renderSpecs(<Coverage />);
		const lint = await card("Check of the scenarios");
		expect(lint.getByText("Two scenarios with the same title").parentElement).toHaveTextContent(
			"None",
		);
		await waitFor(() =>
			expect(lint.getByText("Scenarios with no Then step").parentElement).toHaveTextContent("1"),
		);
		await user.click(await lint.findByRole("button", { name: /weak: no Then step/ }));
		cleanup();
		await renderSpecs(<TestPlans />);
		expect(await screen.findByRole("textbox", { name: "Login" })).toBeVisible();
	});

	it("writes the missing tests and has the action to run the tests", async () => {
		const user = userEvent.setup();
		await renderSpecs(<Coverage />);
		expect(await screen.findByRole("button", { name: "Run the tests" })).toBeVisible();
		const before = Object.keys(files()).filter((p) => p.endsWith(".feature")).length;
		await user.click(await screen.findByRole("button", { name: "Write the missing tests" }));
		await waitFor(() =>
			expect(
				Object.values(files())
					.map((f) => f.text)
					.join("\n"),
			).toContain("spec:auth#REQ-002"),
		);
		expect(
			Object.keys(files()).filter((p) => p.endsWith(".feature")).length,
		).toBeGreaterThanOrEqual(before);
	});
});
