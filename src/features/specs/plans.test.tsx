import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { TestPlans } from "./index";
import { renderSpecs } from "./test-harness";

const files = () => mockState().specs.files;
const PLAN = "docs/delivery/test-plans/auth-login.feature";

describe("Specs / Test plans", () => {
	const plan = (name: RegExp) => screen.findByRole("button", { name, expanded: false });

	it("lists each plan as one row with its scenarios, its coverage and its last verdict", async () => {
		await renderSpecs(<TestPlans />);
		const login = await plan(/Login/);
		expect(login).toHaveTextContent("3 scenarios");
		expect(login).toHaveTextContent("Fail");
		expect(within(login).getByRole("progressbar")).toBeVisible();
		// The requirements stay out of the row until it opens.
		expect(within(login).queryByRole("button")).toBeNull();
		expect(await plan(/Invoice/)).toHaveTextContent("2 scenarios");
	});

	it("opens a plan to list its requirements, one for each line, each with its scenarios and state", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		const login = await plan(/Login/);
		await user.click(login);
		expect(login).toHaveAttribute("aria-expanded", "true");
		const list = await screen.findByRole("list", { name: /^Requirements: Login/ });
		expect(within(list).getByRole("button", { name: /spec:auth#REQ-001/ })).toBeVisible();
		expect(within(list).getByText("A session starts").closest("li")).toHaveTextContent("Pass");
		expect(within(list).getByText("A person signs in").closest("li")).toHaveTextContent("Fail");
		await user.click(login);
		expect(login).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("list", { name: /^Requirements: Login/ })).toBeNull();
	});

	it("filters the plans by a failing scenario and by a search", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await plan(/Login/);
		await user.click(screen.getByRole("button", { name: "Failing" }));
		expect(await plan(/Login/)).toBeVisible();
		expect(screen.queryByRole("button", { name: /Invoice/ })).toBeNull();
		await user.click(screen.getByRole("button", { name: "All" }));
		await user.type(screen.getByRole("textbox", { name: "Search" }), "invoice");
		expect(await plan(/Invoice/)).toBeVisible();
		expect(screen.queryByRole("button", { name: /Login/ })).toBeNull();
	});

	it("flags a citation that no spec holds", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await user.click(await plan(/Login/));
		await user.click(await screen.findByRole("button", { name: "Open the plan" }));
		const broken = await screen.findByRole("list", { name: "Broken citations" });
		expect(within(broken).getByRole("button", { name: /spec:auth#REQ-009.*Broken/ })).toBeVisible();
	});

	it("reports a syntax error with its line after a save", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await user.click(await plan(/Login/));
		await user.click(await screen.findByRole("button", { name: "Open the plan" }));
		const box = await screen.findByRole("textbox", { name: "Login" });
		await waitFor(() => expect(box).toHaveValue(files()[PLAN]?.text ?? ""));
		await user.clear(box);
		await user.type(box, "Scenario: no feature");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const list = await screen.findByRole("list", { name: "Syntax errors" });
		expect(within(list).getByText("Line 1")).toBeVisible();
		expect(files()[PLAN]?.text).toBe("Scenario: no feature");
	});

	it("lints a scenario with no Then and ", async () => {
		const user = userEvent.setup();
		files()[PLAN] = {
			text: "Feature: Login\n  Scenario: weak\n    When a person signs in\n",
			stamp: "s1",
		};
		await renderSpecs(<TestPlans />);
		const lint = await screen.findByRole("button", { name: /weak: no Then step/ });
		await user.click(lint);
		expect(await screen.findByRole("textbox", { name: "Login" })).toBeVisible();
	});

	it("creates a plan from a name", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await user.click(await screen.findByRole("button", { name: "New test plan" }));
		await user.type(screen.getByRole("textbox", { name: "Plan" }), "Export plan");
		await user.click(screen.getByRole("button", { name: "Create" }));
		await waitFor(() =>
			expect(files()["docs/delivery/test-plans/export-plan.feature"]?.text).toBe(
				"Feature: Export plan\n",
			),
		);
	});
});
