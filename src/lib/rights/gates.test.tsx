import { screen, waitFor, within } from "@testing-library/react";
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
	["Code", "/code/branches", "New branch", "code.write"],
	["Knowledge", "/knowledge/handbook", "New page", "knowledge.edit"],
	["Design", "/design/diagrams", "Excalidraw", "design.edit"],
] as const;

describe("a viewer sees the write controls off, with the reason", () => {
	it.each(CASES)("%s", async (_space, path, name, right) => {
		await viewer();
		mountApp(path);
		const button = await screen.findByRole("button", { name });
		expect(button).toBeDisabled();
		expect(button).toHaveAccessibleDescription(needs(right));
	});

	// Start an agent: the ticket field of New feature.
	it("Factory", async () => {
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
		mountApp("/flow/new");
		await userEvent.type(await screen.findByRole("combobox", { name: "Find a ticket" }), "ACME-3");
		const button = await screen.findByRole("button", { name: "Start an agent" });
		expect(button).toBeDisabled();
		expect(button).toHaveAccessibleDescription(needs("runs.start"));
	});

	it("Specs", async () => {
		await viewer();
		mountApp("/specs/changes");
		// New change is an item of the More menu of Flow / List.
		await userEvent.click(await screen.findByRole("button", { name: "More" }));
		const item = await screen.findByRole("menuitem", { name: "New change" });
		expect(item).toHaveAttribute("aria-disabled", "true");
		expect(item).toHaveAccessibleDescription(needs("specs.edit"));
	});
});

describe("a viewer on Plan / Estimates", () => {
	it("sees Add a task off, with the reason", async () => {
		const user = userEvent.setup();
		await viewer();
		mountApp("/work/estimates");
		await user.click(await screen.findByRole("button", { name: "More" }));
		const item = await screen.findByRole("menuitem", { name: "Add a task" });
		expect(item).toHaveAttribute("aria-disabled", "true");
		expect(item).toHaveAccessibleDescription(needs("work.edit"));
	});
});

describe("a viewer on Code / Branches", () => {
	it("sees Push off, with the reason", async () => {
		await viewer();
		mountApp("/code/branches");
		await screen.findByRole("button", { name: "New branch" });
		const push = () =>
			within(screen.getByRole("group", { name: "Branch actions" })).getByRole("button", {
				name: /^Push/,
			});
		await waitFor(() => expect(push()).toBeDisabled());
		expect(push()).toHaveAccessibleDescription(needs("code.write"));
	});
});

describe("a viewer on a pull request page", () => {
	const open = async (id: string, path = `/code/pull-requests/${id}`) => {
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
		mountApp(path);
	};
	// The merge card holds Merge and More, with the actions of the state.
	const moreOfMerge = async (user: ReturnType<typeof userEvent.setup>) =>
		user.click(
			within(await screen.findByRole("region", { name: "Merge" })).getByRole("button", {
				name: "More",
			}),
		);

	it("sees Mark ready off, with the reason", async () => {
		const user = userEvent.setup();
		await open("github-demo-143");
		await moreOfMerge(user);
		const item = await screen.findByRole("menuitem", { name: "Mark ready" });
		expect(item).toHaveAttribute("aria-disabled", "true");
		expect(item).toHaveAccessibleDescription(needs("code.write"));
	});

	it("sees Merge off, with the reason", async () => {
		await open("github-demo-141");
		const merge = await screen.findByRole("button", { name: "Merge pull request" });
		expect(merge).toBeDisabled();
		expect(merge).toHaveAccessibleDescription(needs("code.merge"));
		expect(merge.closest("span[title]")).toHaveAttribute("title", needs("code.merge"));
		// The method switch only chooses a method: it merges nothing.
		const method = screen.getByRole("group", { name: "Method" });
		expect(method).toBeVisible();
		for (const b of within(method).getAllByRole("button")) expect(b).toBeDisabled();
	});

	it("sees Comment, Reply, Resolve and Reopen off, with the reason", async () => {
		const user = userEvent.setup();
		await open("github-demo-142");
		// The write box and the threads are in Chat.
		await user.click(
			within(await screen.findByRole("navigation", { name: "Sections" })).getByRole("button", {
				name: "Chat",
			}),
		);
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
		await open("github-demo-142", "/flow/feature/pr%3Agithub-demo%3A142/files");
		// The first file is open on arrival.
		expect(
			await screen.findByRole("button", { name: /^src\/app\.ts/, expanded: true }),
		).toBeInTheDocument();
		// Only the current row draws its plus.
		const plus = await screen.findByRole("button", { name: /^Add a comment on line/ });
		expect(plus).toHaveAttribute("aria-disabled", "true");
		expect(plus).toHaveAccessibleDescription(needs("code.write"));
		plus.focus();
		expect(plus).toHaveFocus();
		await user.click(plus);
		expect(screen.queryByRole("textbox", { name: /^Comment on line/ })).toBeNull();
	});

	it("sees Close pull request off in the menu, with the reason", async () => {
		const user = userEvent.setup();
		await open("github-demo-141");
		await moreOfMerge(user);
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
		await user.click(await screen.findByRole("button", { name: "Costing" }));
		const cost = await screen.findByText("Cost", { selector: "span" });
		expect(cost.nextElementSibling).toHaveTextContent("—");
		expect(screen.queryByText(/€/)).toBeNull();
	});
});
