import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { withTracker } from "@/test/tracker";
import { Decisions } from "./decisions";
import { mountDesign } from "./harness";

describe("design to code (REQ-020, Q-038 option 1)", () => {
	it("creates one work item that cites an accepted ADR, from the inspector", async () => {
		const user = userEvent.setup();
		await withTracker();
		await mountDesign(<Decisions />);
		await user.click(
			within(await screen.findByRole("list", { name: "Decisions" })).getByRole("button", {
				name: /0004/,
			}),
		);
		const panel = within(await screen.findByRole("complementary", { name: "Inspector" }));
		await user.click(await panel.findByRole("button", { name: "Create work item" }));
		const dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findByRole("heading", { name: "Create (1)" })).toBeInTheDocument();
		// The preview writes nothing.
		expect(Object.keys(mockState().work.written)).toHaveLength(0);
		await user.click(dialog.getByRole("button", { name: "Apply" }));
		expect(await dialog.findByRole("heading", { name: "Written (1)" })).toBeInTheDocument();
		await waitFor(() =>
			expect(mockState().work.written["adr:0004"]?.row.title).toBe(
				"Polling sync with local mirror",
			),
		);
		// The ticket cites the ref. Normal pickup starts the run.
		expect(mockState().work.written["adr:0004"]?.row.reference).toBe("adr:0004");
	});

	it("is offered on a screen as well", async () => {
		const user = userEvent.setup();
		await withTracker();
		const { Screens } = await import("./screens");
		await mountDesign(<Screens />);
		await user.click(
			within(await screen.findByRole("list", { name: "Screens" })).getByRole("button", {
				name: /Home/,
			}),
		);
		const panel = within(await screen.findByRole("complementary", { name: "Inspector" }));
		expect(await panel.findByRole("button", { name: "Create work item" })).toBeInTheDocument();
	});
});
