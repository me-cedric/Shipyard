import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { TestPlans } from "./index";
import { renderSpecs } from "./test-harness";

const files = () => mockState().specs.files;
const PLAN = "docs/delivery/test-plans/auth-login.feature";

describe("Specs / Test plans", () => {
	it("lists each plan with its scenario count and its cited refs", async () => {
		await renderSpecs(<TestPlans />);
		const login = await screen.findByRole("row", { name: /Login/ });
		expect(login).toHaveTextContent("3");
		expect(within(login).getByRole("button", { name: /spec:auth#REQ-001/ })).toBeInTheDocument();
		expect(await screen.findByRole("row", { name: /Invoice/ })).toHaveTextContent("2");
	});

	it("lists the requirements that no scenario cites, for each capability", async () => {
		await renderSpecs(<TestPlans />);
		const auth = await screen.findByRole("region", { name: "Coverage: auth" });
		await waitFor(() =>
			expect(within(auth).getByRole("heading", { name: "auth (1)" })).toBeVisible(),
		);
		expect(within(auth).getByRole("button", { name: /spec:auth#REQ-002/ })).toBeVisible();
		expect(await screen.findByRole("heading", { name: "billing (0)" })).toBeVisible();
	});

	it("flags a citation that no spec holds", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await user.click(await screen.findByRole("row", { name: /Login/ }));
		const broken = await screen.findByRole("list", { name: "Broken citations" });
		expect(within(broken).getByRole("button", { name: /spec:auth#REQ-009.*Broken/ })).toBeVisible();
	});

	it("reports a syntax error with its line after a save", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		await user.click(await screen.findByRole("row", { name: /Login/ }));
		const box = await screen.findByRole("textbox", { name: "Login" });
		await waitFor(() => expect(box).toHaveValue(files()[PLAN]?.text ?? ""));
		await user.clear(box);
		await user.type(box, "Scenario: no feature");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const list = await screen.findByRole("list", { name: "Syntax errors" });
		expect(within(list).getByText("Line 1")).toBeVisible();
		expect(files()[PLAN]?.text).toBe("Scenario: no feature");
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
