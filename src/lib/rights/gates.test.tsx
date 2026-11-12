import { screen, within } from "@testing-library/react";
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

describe("a viewer on a pull request page", () => {
	const open = async (id: string) => {
		await viewer();
		await unwrap(commands.projectsOpen("/mock/demo", false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		mountApp(`/code/pull-requests/${id}`);
	};

	it("sees Mark ready off, with the reason", async () => {
		await open("github-demo-143");
		const button = await screen.findByRole("button", { name: "Mark ready" });
		expect(button).toBeDisabled();
		expect(button).toHaveAccessibleDescription(needs("code.write"));
	});

	it("sees Merge and its methods off, with the reason", async () => {
		await open("github-demo-141");
		const merge = await screen.findByRole("button", { name: "Merge" });
		expect(merge).toBeDisabled();
		expect(merge).toHaveAccessibleDescription(needs("code.merge"));
		expect(merge.closest("span[title]")).toHaveAttribute("title", needs("code.merge"));
		expect(screen.getByRole("button", { name: "Method" })).toBeDisabled();
	});

	it("sees Comment, Reply, Resolve and Reopen off, with the reason", async () => {
		const user = userEvent.setup();
		await open("github-demo-142");
		const off = (b: HTMLElement) => {
			expect(b).toBeDisabled();
			expect(b).toHaveAccessibleDescription(needs("code.write"));
		};
		const live = within(await screen.findByRole("article", { name: "src/app.ts:2" }));
		off(live.getByRole("button", { name: "Reply to src/app.ts:2" }));
		off(live.getByRole("button", { name: "Resolve" }));
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "x");
		off(screen.getByRole("button", { name: "Comment" }));
		await user.click(screen.getByRole("button", { name: /src\/lib\.ts:7/ }));
		off(await screen.findByRole("button", { name: "Reopen" }));
	});

	it("sees the + of a line off, with the reason, and it opens no box", async () => {
		const user = userEvent.setup();
		await open("github-demo-142?tab=files");
		await user.click(await screen.findByRole("button", { name: /^app\.ts/ }));
		const plus = await screen.findByRole("button", { name: "Add a comment on line 3" });
		expect(plus).toHaveAttribute("aria-disabled", "true");
		expect(plus).toHaveAccessibleDescription(needs("code.write"));
		plus.focus();
		expect(plus).toHaveFocus();
		await user.click(plus);
		expect(screen.queryByRole("textbox", { name: "Comment on line 3" })).toBeNull();
	});

	it("sees Close pull request off in the menu, with the reason", async () => {
		const user = userEvent.setup();
		await open("github-demo-141");
		await user.click(await screen.findByRole("button", { name: "More" }));
		const item = await screen.findByRole("menuitem", { name: "Close pull request" });
		expect(item).toHaveAttribute("aria-disabled", "true");
		expect(item).toHaveAccessibleDescription(needs("code.write"));
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
