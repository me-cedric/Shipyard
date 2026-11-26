import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER, mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

let router: ReturnType<typeof mountApp> | undefined;
afterEach(() => waitFor(() => expect(router?.state.status ?? "idle").toBe("idle")));

/** Opens the page of the step `name` of the recipe `id`. */
async function openStep(id: string, name: string) {
	const user = userEvent.setup();
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	router = mountApp("/crew/recipes");
	await user.click(
		await screen.findByRole("button", {
			name: new RegExp(`^${id.charAt(0).toUpperCase()}${id.slice(1)}`),
		}),
	);
	const steps = await screen.findByRole("list", { name: "Steps" });
	await user.click(await within(steps).findByRole("link", { name }));
	await screen.findByRole("heading", { level: 1, name });
	return user;
}

/** The row of a step page: its group comes first when a control of the row has the same name. */
const row = (name: string) => screen.getAllByRole("group", { name })[0] as HTMLElement;
const off = (el: HTMLElement) => expect(el).toHaveAttribute("aria-disabled", "true");

describe("Rows of a recipe step (REQ-009)", () => {
	it("shows Kind from the step: agent, person or check", async () => {
		await openStep("feature", "Plan");
		// The plan waits for a person.
		expect(within(row("Kind")).getByText("Person")).toBeVisible();
		expect(row("Kind").querySelector("button, [role=combobox]")).toBeNull();
	});

	it("shows Agent for a builder and Check for a review", async () => {
		await openStep("feature", "Build");
		expect(within(row("Kind")).getByText("Agent")).toBeVisible();
		const user = userEvent.setup();
		await user.click(screen.getByRole("link", { name: "Recipes" }));
		const steps = await screen.findByRole("list", { name: "Steps" });
		await user.click(await within(steps).findByRole("link", { name: "Review" }));
		await screen.findByRole("heading", { level: 1, name: "Review" });
		expect(within(row("Kind")).getByText("Check")).toBeVisible();
	});

	it("turns Runs beside other steps on by taking the needs out, and off by needing the step before", async () => {
		const user = await openStep("feature", "Build");
		const beside = screen.getByRole("switch", { name: "Runs beside other steps" });
		// Build needs Plan: it runs after it.
		expect(beside).not.toBeChecked();
		await user.click(beside);
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: "Runs beside other steps" })).toBeChecked(),
		);
		await user.click(screen.getByRole("switch", { name: "Runs beside other steps" }));
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: "Runs beside other steps" })).not.toBeChecked(),
		);
	});

	it("has Runs beside other steps on and off the control for the first step", async () => {
		await openStep("feature", "Grill");
		const beside = screen.getByRole("switch", { name: "Runs beside other steps" });
		expect(beside).toBeChecked();
		off(beside);
	});

	it("turns Child steps run side by side off with one at a time, and on with the default", async () => {
		const user = await openStep("feature", "Build");
		const side = screen.getByRole("switch", { name: "Child steps run side by side" });
		expect(side).toBeChecked();
		await user.click(side);
		await waitFor(() =>
			expect(
				screen.getByRole("switch", { name: "Child steps run side by side" }),
			).not.toBeChecked(),
		);
		expect(within(row("Child steps at once")).getByRole("status")).toHaveTextContent("1");
		await user.click(screen.getByRole("switch", { name: "Child steps run side by side" }));
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: "Child steps run side by side" })).toBeChecked(),
		);
	});

	it("has no side by side for a step with nothing to repeat for", async () => {
		await openStep("feature", "Grill");
		off(screen.getByRole("switch", { name: "Child steps run side by side" }));
	});

	it("sets Mode of an agent step", async () => {
		const user = await openStep("feature", "Build");
		const before = (await unwrap(commands.workflowGet("feature"))).text.split("mode: plan").length;
		await user.click(screen.getByRole("combobox", { name: "Mode" }));
		await user.click(await screen.findByRole("option", { name: "Plan" }));
		await user.click(screen.getByRole("link", { name: "Recipes" }));
		await user.click(await screen.findByRole("button", { name: "Edit as text" }));
		const editor = (await screen.findByRole("textbox", { name: "feature" })) as HTMLTextAreaElement;
		await waitFor(() => expect(editor.value.split("mode: plan").length).toBe(before + 1));
	});

	it("sets May write to Alone with one click, which is Do not ask again for this recipe", async () => {
		const user = await openStep("feature", "Pull request");
		const pressed = (name: string) =>
			expect(within(row("May write")).getByRole("button", { name })).toHaveAttribute(
				"aria-pressed",
				"true",
			);
		pressed("Asks first");
		await user.click(within(row("May write")).getByRole("button", { name: "Alone" }));
		await waitFor(() =>
			expect(mockState().sync.automation.recipe_writes?.feature).toContain("open_pr"),
		);
		await waitFor(() => pressed("Alone"));
		// Back to Asks first takes the permission out again.
		await user.click(within(row("May write")).getByRole("button", { name: "Asks first" }));
		await waitFor(() =>
			expect(mockState().sync.automation.recipe_writes?.feature ?? []).not.toContain("open_pr"),
		);
	});
});

describe("Role of a human step (REQ-008)", () => {
	it("sets the role of a step that waits for a person, shows it in the chain and clears it with the wait", async () => {
		const user = await openStep("feature", "Plan");
		await user.click(screen.getByRole("combobox", { name: "Who approves" }));
		await user.click(await screen.findByRole("option", { name: "Tech lead" }));
		await user.click(screen.getByRole("link", { name: "Recipes" }));
		// The pill of the role sits on the row of the person, as the design draws it.
		const steps = await screen.findByRole("list", { name: "Steps" });
		await waitFor(() => expect(within(steps).getByText("Tech lead")).toBeVisible());
		await user.click(await screen.findByRole("button", { name: "Edit as text" }));
		const editor = (await screen.findByRole("textbox", { name: "feature" })) as HTMLTextAreaElement;
		expect(editor.value).toContain("approver: techlead");
		await user.click(screen.getByRole("button", { name: "Show the steps" }));
		await user.click(
			await within(await screen.findByRole("list", { name: "Steps" })).findByRole("link", {
				name: "Plan",
			}),
		);
		await user.click(await screen.findByRole("switch", { name: "Waits for a person" }));
		await waitFor(() =>
			expect(screen.queryByRole("combobox", { name: "Who approves" })).toBeNull(),
		);
		await user.click(screen.getByRole("link", { name: "Recipes" }));
		await user.click(await screen.findByRole("button", { name: "Edit as text" }));
		const again = (await screen.findByRole("textbox", { name: "feature" })) as HTMLTextAreaElement;
		expect(again.value).not.toContain("approver");
	});

	it("refuses the approval of a person with another role and lets the role approve", async () => {
		await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
		const wf = (await unwrap(commands.workflowGet("feature"))).text;
		await unwrap(
			commands.workflowWrite(
				"feature",
				wf.replace("    gate: human", "    gate: human\n    approver: techlead"),
			),
		);
		const run = (await unwrap(commands.runsList())).find((r) => r.state === "PlanReview");
		if (!run) throw new Error("the demo has a plan that waits");
		expect(run.approver).toBe("techlead");
		const as = (role: "developer" | "techlead") => {
			mockState().person = {
				member: "bo",
				found: "email",
				role,
				admin: false,
				readOnly: false,
				rights: [],
			};
		};
		as("developer");
		await expect(unwrap(commands.runPlanApprove(run.id))).rejects.toMatchObject({
			details: expect.stringContaining("only the role techlead approves this step"),
		});
		await expect(unwrap(commands.runPlanReject(run.id, "no"))).rejects.toBeTruthy();
		as("techlead");
		await unwrap(commands.runPlanApprove(run.id));
		expect(mockState().factory.runs.find((r) => r.id === run.id)?.state).toBe("Working");
	});
});
