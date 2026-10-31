import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { TestPlans } from "./index";
import { renderSpecs } from "./test-harness";

const PLAN = "docs/delivery/test-plans/auth.feature";

describe("Specs / Test plans / Requirements", () => {
	it("lists each requirement with the scenarios that cite it and the ones that no scenario cites", async () => {
		await renderSpecs(<TestPlans />);
		const auth = await screen.findByRole("region", { name: "Requirements: auth" });
		const row = (title: string) => within(auth).getByText(title).closest("li") as HTMLElement;
		await waitFor(() => expect(row("Keep a session")).toHaveTextContent("1 scenarios"));
		expect(row("Keep a session")).toHaveTextContent("Pass");
		expect(row("Login")).toHaveTextContent("Fail");
		expect(row("Sign out")).toHaveTextContent("No scenario");
	});

	it("adds one stub for each uncovered requirement after a click and opens the plan", async () => {
		const user = userEvent.setup();
		await renderSpecs(<TestPlans />);
		expect(mockState().specs.files[PLAN]).toBeUndefined();
		await user.click(await screen.findByRole("button", { name: "Generate scenarios for auth" }));
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
		expect(screen.queryByRole("button", { name: "Generate scenarios for auth" })).toBeNull();
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
		const auth = await screen.findByRole("region", { name: "Requirements: auth" });
		await waitFor(() =>
			expect(within(auth).getByText("Sign out").closest("li")).toHaveTextContent("No scenario"),
		);
		expect(screen.queryByRole("button", { name: "Generate scenarios for auth" })).toBeNull();
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
