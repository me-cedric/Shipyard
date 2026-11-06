import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

const viewer = async () => {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	mockState().person = {
		member: "bo",
		found: "email",
		role: "viewer",
		admin: false,
		readOnly: false,
		rights: [],
	};
};

const needs = (right: string) => `Needs the right ${right} (your role: Viewer)`;

/** Each case: a route, the name of one write control and the right that the backend asks for. */
const CASES = [
	["Code", "/code/branches", "Branch", "code.write"],
	["Work", "/work/estimates", "Task", "work.edit"],
	["Factory", "/factory/runs", "Start run", "runs.start"],
	["Specs", "/specs/changes", "New change", "specs.edit"],
	["Knowledge", "/knowledge/handbook", "New page", "knowledge.edit"],
	["Design", "/design/diagrams", "Diagram", "design.edit"],
] as const;

describe("a viewer sees the write controls off, with the reason", () => {
	it.each(CASES)("%s", async (_space, path, name, right) => {
		await viewer();
		mountApp(path);
		const button = await screen.findByRole("button", { name });
		expect(button).toBeDisabled();
		expect(button).toHaveAccessibleDescription(needs(right));
	});
});

describe("Costs", () => {
	it("shows a dash, not the money, without costs.view", async () => {
		const user = userEvent.setup();
		await withTracker();
		const team = mockState().work.team.members;
		const [ada, , alan] = team;
		if (ada && alan)
			team.push(
				{ ...ada, name: "Linus", handle: "linus", trackers: [] },
				{ ...alan, name: "Barbara", handle: "barbara", trackers: [], dayRate: 400 },
				{ ...alan, name: "Frances", handle: "frances", trackers: [], dayRate: 440 },
			);
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp("/work/estimates");
		await user.click(await screen.findByRole("tab", { name: "Summary" }));
		const cost = await screen.findByText("Cost", { selector: "dt" });
		expect(cost.nextElementSibling).toHaveTextContent("—");
		expect(screen.queryByText(/€/)).toBeNull();
	});
});
