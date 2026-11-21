import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { TestPlans } from "./index";
import { renderSpecs } from "./test-harness";

const PLAN = "docs/delivery/test-plans/auth.feature";

describe("Specs / Test plans / Requirements", () => {
	it("lists each requirement of the plan with its scenarios and the ones that no scenario cites", async () => {
		await renderSpecs(<TestPlans />);
		const auth = await screen.findByRole("region", { name: "Requirements" });
		const row = (title: string) => within(auth).getByText(title).closest("button") as HTMLElement;
		await waitFor(() => expect(row("Keep a session")).toHaveTextContent("Tested"));
		expect(row("Login")).toHaveTextContent("Fail");
		expect(row("Sign out")).toHaveTextContent("No test yet");
	});

	it("adds one stub for each uncovered requirement after a click and opens the plan", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		expect(mockState().specs.files[PLAN]).toBeUndefined();
		await user.click(await screen.findByRole("button", { name: "Write the scenarios for me" }));
		await waitFor(() =>
			expect(mockState().specs.files[PLAN]?.text).toContain("Scenario: Sign out"),
		);
		const text = mockState().specs.files[PLAN]?.text ?? "";
		expect(text).toContain("@spec:auth#REQ-002");
		expect(text).toMatch(/^Feature: auth\n/);
		// The steps come from the text of the requirement, not from filler words.
		expect(text).toContain("    When a person asks\n    Then it works\n");
		expect(text).not.toContain("the context of the requirement");
		expect(await unwrap(commands.specsCoverage("auth"))).toEqual([]);
		// The plan that holds the new scenarios opens.
		expect(await screen.findByRole("heading", { name: "Test plan: auth", level: 1 })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Write the scenarios for me" })).toBeNull();
	});

	it("offers no generation for a requirement that has no text of a scenario", async () => {
		const spec = "docs/openspec/specs/auth/spec.md";
		const f = mockState().specs.files[spec];
		if (!f) throw new Error("no spec");
		// Sign out keeps its sentence and loses its scenario text.
		const bare = f.text.replace(
			"#### Scenario: Sign out\n\n- **WHEN** a person asks\n- **THEN** it works\n\n",
			"",
		);
		expect(bare).not.toBe(f.text);
		mockState().specs.files[spec] = { ...f, text: bare };
		await renderSpecs(<TestPlans />);
		const auth = await screen.findByRole("region", { name: "Requirements" });
		await waitFor(() =>
			expect(within(auth).getByText("Sign out").closest("button")).toHaveTextContent("No test yet"),
		);
		expect(screen.queryByRole("button", { name: "Write the scenarios for me" })).toBeNull();
		expect((await unwrap(commands.specsTestplanGenerate("auth", true))).added).toBe(0);
		expect(mockState().specs.files[PLAN]).toBeUndefined();
	});

	it("refuses a generation with no click and an unknown capability", async () => {
		await renderSpecs(<TestPlans />);
		await expect(unwrap(commands.specsTestplanGenerate("auth", false))).rejects.toBeDefined();
		await expect(unwrap(commands.specsTestplanGenerate("nope", true))).rejects.toBeDefined();
		expect(mockState().specs.files[PLAN]).toBeUndefined();
	});
});
