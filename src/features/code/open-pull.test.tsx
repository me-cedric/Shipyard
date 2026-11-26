import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode, seedDemoCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

/** The working branch is published, so the open works. */
function published() {
	const code = seedCode();
	code.branch = "feat/demo/login";
	code.remoteBranches.push("origin/feat/demo/login");
	mockState().code = code;
}

describe("New pull request, Reviewers and Merge with (REQ-006)", () => {
	afterEach(() => localStorage.clear());

	it("asks the code host for the reviewer that the person picked", async () => {
		const user = userEvent.setup();
		await demo();
		published();
		const router = mountApp("/code/pull-requests/new");
		const title = await screen.findByRole("textbox", { name: "Title" });
		await user.clear(title);
		await user.type(title, "feat(code): login");
		await user.click(screen.getByRole("button", { name: "Reviewers" }));
		await user.click(await screen.findByRole("menuitemcheckbox", { name: "Grace Hopper" }));
		await user.keyboard("{Escape}");
		expect(await screen.findByRole("button", { name: "Grace Hopper" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Open the pull request" }));
		expect(await screen.findByRole("button", { name: "Close the pull request" })).toBeVisible();
		// The code host took the reviewer: no refusal shows.
		expect(screen.queryByRole("alert")).toBeNull();
		await idle(router);
	});

	it("offers Merge, Squash and Rebase and keeps the pick as the default of the Merge button", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/new");
		const group = await screen.findByRole("group", { name: "Merge with" });
		expect(
			within(group)
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["Merge", "Squash", "Rebase"]);
		await user.click(within(group).getByRole("button", { name: "Squash" }));
		expect(within(group).getByRole("button", { name: "Squash" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await idle(router);
		router.history.push("/code/pull-requests/github-demo-141");
		// The merge card of a pull request starts on the method that the person picked.
		const card = within(await screen.findByRole("region", { name: "Merge" }));
		await waitFor(() =>
			expect(card.getByRole("button", { name: "Squash" })).toHaveAttribute("aria-pressed", "true"),
		);
	});
});

describe("New pull request, leave guard", () => {
	afterEach(() => localStorage.clear());

	it("asks before the person leaves with a typed title, and not after the open", async () => {
		const user = userEvent.setup();
		await demo();
		published();
		const router = mountApp("/code/pull-requests/new");
		const title = await screen.findByRole("textbox", { name: "Title" });
		await user.clear(title);
		await user.type(title, "feat(code): login");
		await user.click(screen.getByRole("link", { name: "Pull requests" }));
		const dialog = await screen.findByRole("dialog", { name: "Leave this page?" });
		await user.click(within(dialog).getByRole("button", { name: "Stay" }));
		await user.click(screen.getByRole("button", { name: "Open the pull request" }));
		await screen.findByRole("button", { name: "Close the pull request" });
		await user.click(screen.getByRole("link", { name: "Pull requests" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/pull-requests"));
		expect(screen.queryByRole("dialog", { name: "Leave this page?" })).toBeNull();
		await idle(router);
	});
});

describe("New pull request, Close and Mark as ready (REQ-007)", () => {
	it("shows Mark as ready for a draft only, and Close the pull request after the open", async () => {
		const user = userEvent.setup();
		await demo();
		published();
		const router = mountApp("/code/pull-requests/new");
		// Before the open there is no pull request to close.
		await screen.findByRole("textbox", { name: "Title" });
		expect(screen.queryByRole("button", { name: "Close the pull request" })).toBeNull();
		await user.clear(screen.getByRole("textbox", { name: "Title" }));
		await user.type(screen.getByRole("textbox", { name: "Title" }), "feat(code): login");
		await user.click(screen.getByRole("switch", { name: "Draft" }));
		await user.click(screen.getByRole("button", { name: "Open the pull request" }));
		const ready = await screen.findByRole("button", { name: "Mark as ready" });
		expect(screen.getByRole("button", { name: "Close the pull request" })).toBeVisible();
		await user.click(ready);
		await waitFor(() => expect(screen.queryByRole("button", { name: "Mark as ready" })).toBeNull());
		expect(mockState().prs?.pulls.at(-1)?.draft).toBe(false);
		await user.click(screen.getByRole("button", { name: "Close the pull request" }));
		await waitFor(() => expect(mockState().prs?.pulls.at(-1)?.state).toBe("closed"));
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Close the pull request" })).toBeNull(),
		);
		await idle(router);
	});

	it("shows only Close the pull request for a pull request that is not a draft", async () => {
		const user = userEvent.setup();
		await demo();
		published();
		const router = mountApp("/code/pull-requests/new");
		const title = await screen.findByRole("textbox", { name: "Title" });
		await user.clear(title);
		await user.type(title, "feat(code): login");
		await user.click(screen.getByRole("button", { name: "Open the pull request" }));
		expect(await screen.findByRole("button", { name: "Close the pull request" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Mark as ready" })).toBeNull();
		await idle(router);
	});
});

describe("New pull request, the title", () => {
	it("starts as the last commit summary and names the problem when it is empty", async () => {
		const user = userEvent.setup();
		await demo();
		const code = seedDemoCode();
		code.branch = "feat/demo/pr-142";
		mockState().code = code;
		const router = mountApp("/code/pull-requests/new");
		await waitFor(() => expect(screen.getByRole("textbox", { name: "Title" })).not.toHaveValue(""));
		const title = screen.getByRole("textbox", { name: "Title" });
		expect(title).not.toHaveAttribute("aria-invalid");
		await user.clear(title);
		await user.click(screen.getByRole("button", { name: "Open the pull request" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Write a title first");
		expect(title).toHaveAttribute("aria-invalid", "true");
		await idle(router);
	});

	it("fills the title for a pushed branch with its own commit", async () => {
		await demo();
		const code = seedDemoCode();
		code.branch = "feat/demo/pr-142";
		code.remoteBranches.push("origin/feat/demo/pr-142");
		mockState().code = code;
		const router = mountApp("/code/pull-requests/new");
		await waitFor(() =>
			expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
				"fix(auth): refuse an empty token",
			),
		);
		await idle(router);
	});
});
