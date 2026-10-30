import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { Decisions } from "./decisions";
import { mountDesign } from "./harness";

const plans = () => Object.keys(mockState().specs.files).filter((k) => k.endsWith("/proposal.md"));

describe("design to code (REQ-020): the next step of a design item", () => {
	it("writes a plan from an ADR in the inspector with one click, then offers the split", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click(
			within(await screen.findByRole("list", { name: "Decisions" })).getByRole("button", {
				name: /0004/,
			}),
		);
		const panel = within(await screen.findByRole("complementary", { name: "Inspector" }));
		const before = plans().length;
		// One way only: the inspector has no second create action.
		expect(panel.queryByRole("button", { name: "Create work item" })).toBeNull();
		await user.click(await panel.findByRole("button", { name: "Write plan" }));
		await waitFor(() => expect(plans()).toHaveLength(before + 1));
		expect(plans().some((p) => p.includes("polling-sync"))).toBe(true);
		expect(await panel.findByRole("button", { name: "Split into work items" })).toBeVisible();
	});

	it("is offered on a screen as well", async () => {
		const user = userEvent.setup();
		const { Screens } = await import("./screens");
		await mountDesign(<Screens />);
		await user.click(
			within(await screen.findByRole("list", { name: "Screens" })).getByRole("button", {
				name: /Home/,
			}),
		);
		const panel = within(await screen.findByRole("complementary", { name: "Inspector" }));
		expect(await panel.findByRole("button", { name: "Write plan" })).toBeInTheDocument();
	});
});
