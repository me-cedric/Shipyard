import { RouterContextProvider } from "@tanstack/react-router";
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { createAppRouter, createMemoryHistory } from "@/app/router";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { NotificationsProvider } from "@/lib/notifications";
import { pullHref, pullNumberOf, pullOfRef, ShellProvider, useShell } from "@/lib/shell";
import { rememberSelection } from "@/lib/shell/selection";
import { mountApp } from "@/test/mount";
import { routers } from "@/test/routers";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));
const row = (name: RegExp) => screen.findByRole("link", { name });
// The conversation and the write box are in Chat.
const toChat = () => section(userEvent.setup(), "Chat");
const toStory = () => section(userEvent.setup(), "Story");
// A section of the feature page, from its switch.
const section = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
	user.click(
		within(await screen.findByRole("navigation", { name: "Sections" })).getByRole("button", {
			name,
		}),
	);
// The merge card: the method, Merge, and More with the actions of the state.
const mergeCard = async () => within(await screen.findByRole("region", { name: "Merge" }));
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

describe("Code / Now, the pull requests", () => {
	it("lists the mirror by state with counts", async () => {
		await demo();
		const router = mountApp("/code/now");
		const user = userEvent.setup();
		await row(/health route/);
		// Code Now shows the open ones only, with their checks. "Merged and closed" opens the page.
		expect(screen.queryByRole("heading", { name: "Open, 9" })).toBeNull();
		const past = screen.getByRole("link", { name: "Merged and closed" });
		expect(past).toHaveAttribute("href", "/code/pull-requests");
		await user.click(past);
		expect(await screen.findByRole("heading", { name: "Open, 9" })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe("/code/pull-requests");
		expect(screen.getByRole("heading", { name: "Merged" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Closed" })).toBeInTheDocument();
		await idle(router);
	});

	/** The factory mock gives its pull requests to the first project that asks: the second has none. */
	const emptyProject = async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.pullsList());
		await unwrap(commands.projectsOpen("/mock/beta", false));
	};
	const codeHost = async () => {
		const c = await unwrap(
			commands.connectionsAdd({
				name: "Hub",
				group: "forge",
				kind: "github",
				url: "https://github.com",
				user: null,
			}),
		);
		await unwrap(commands.connectionsSetSecret(c.id, "tok"));
		return c;
	};

	it("offers Connect when the project has no code host, and opens the code host form", async () => {
		const user = userEvent.setup();
		await emptyProject();
		mountApp("/code/now");
		expect(screen.queryByRole("button", { name: "New pull request" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "Connect" }));
		expect(await screen.findByRole("combobox", { name: "Type" })).toHaveTextContent("Code host");
	});

	it("offers New pull request, not Connect, when the code host works and has no pull request", async () => {
		const user = userEvent.setup();
		await emptyProject();
		await codeHost();
		mountApp("/code/now");
		await user.click(await screen.findByRole("button", { name: "New pull request" }));
		// The form is a page with its own address, not a dialog.
		expect(
			await screen.findByRole("heading", { level: 1, name: "New pull request" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
	});

	it("shows the error of the code host with its action instead of an empty state", async () => {
		await emptyProject();
		const c = await codeHost();
		mockState().sync.failures[c.id] = "HTTP 401";
		mountApp("/code/now");
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"The server refused the token. Make a new token.",
		);
		expect(screen.getByRole("button", { name: "Open settings" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "New pull request" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
	});

	it("shows the error when the status call itself fails", async () => {
		await emptyProject();
		const spy = vi
			.spyOn(commands, "pullsStatusGet")
			.mockResolvedValue({ status: "error", error: "HTTP 401" } as never);
		mountApp("/code/now");
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
		spy.mockRestore();
	});

	it("opens a pull request as a page with its address, header and sections", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/now");
		await user.click(await row(/Rename the Work tab/));
		expect(
			await screen.findByRole("heading", { level: 1, name: /Rename the Work tab/ }),
		).toBeVisible();
		expect(router.state.location.pathname).toBe("/code/pull-requests/github-demo-142");
		expect(await screen.findByText("feat/demo/pr-142 to main")).toBeInTheDocument();
		expect(screen.getByTitle("Lines added")).toHaveTextContent("+1");
		// A count of zero is not drawn: the name keeps the exact count.
		expect(screen.queryByTitle("Lines removed")).toBeNull();
		expect(screen.getByText("Lines removed: 0")).toBeInTheDocument();
		const sections = within(screen.getByRole("navigation", { name: "Sections" }));
		for (const name of ["Story", "Brief", "Design", "Changes", "Checks", "Chat"])
			expect(sections.getByRole("button", { name })).toBeInTheDocument();
		// A pull request opens on Changes.
		expect(sections.getByRole("button", { name: "Changes" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		// The page shows no switch of the place (`spec:app-redesign#REQ-001`): the Code bar is not drawn.
		expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
		await idle(router);
	});

	it("shows the conversation in Chat, and the reviewers and the links in the side column of the Story", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		await section(user, "Chat");
		expect(await screen.findByRole("heading", { name: "Conversation (4)" })).toBeInTheDocument();
		expect(screen.getByText("rename this")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Review with an agent" })).toBeInTheDocument();
		await section(user, "Story");
		const side = await screen.findByRole("complementary", { name: "Details" });
		expect(within(side).getByText("Grace Hopper")).toBeInTheDocument();
		expect(within(side).getByText("Changes asked")).toBeInTheDocument();
		expect(within(side).getByText(/wi:SHIP-42/)).toBeInTheDocument();
		// The data has no assignee, project or milestone.
		expect(screen.queryByText(/assignee|milestone/i)).toBeNull();
		await idle(router);
	});

	it("keeps the section in the address and shows each section", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		// Changes opens one file and links to the page of all the files.
		expect(await screen.findByRole("link", { name: /commits?, all files/ })).toBeInTheDocument();
		await section(user, "Checks");
		expect(router.state.location.search).toEqual({ section: "checks" });
		// The checks of the code host: the summary says the count, each row has a Pass or Fail pill.
		expect(await screen.findByRole("region", { name: "2 of 3 checks fail" })).toBeVisible();
		const host = within(
			(await screen.findByRole("heading", { name: "Code host checks" }))
				.parentElement as HTMLElement,
		);
		expect(
			host
				.getAllByRole("listitem")
				.map((r) => r.textContent)
				.sort(),
		).toEqual(["FailinglintFailFull log", "FailingunitFailFull log", "PassingbuildPass"]);
		expect(host.getAllByRole("img", { name: "Failing" })).toHaveLength(2);
		expect(host.getAllByRole("button", { name: "Full log" })).toHaveLength(2);
		await section(user, "Changes");
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		// The Checks card of Changes: failing first, each check links to its page.
		const card = within(
			(await screen.findByRole("heading", { level: 2, name: "Checks" }))
				.parentElement as HTMLElement,
		);
		expect(card.getAllByRole("link").map((a) => a.textContent)).toEqual(["unit", "lint", "build"]);
		expect(card.getByRole("link", { name: "unit" })).toHaveAttribute(
			"href",
			"https://ci.example.com/unit",
		);
		// The commits and the files are on the page of the changed files.
		await user.click(await screen.findByRole("link", { name: /commits?, all files/ }));
		await screen.findByText(/^0 of \d+ seen$/);
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitemcheckbox", { name: "Commits" }));
		await user.keyboard("{Escape}");
		const commits = await screen.findByRole("region", { name: "Commits" });
		expect(within(commits).getByText("fix(auth): refuse an empty token")).toBeInTheDocument();
		expect(await screen.findByText(/^0 of \d+ seen$/)).toBeInTheDocument();
		await idle(router);
	});

	it("opens a section from its address", async () => {
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142?tab=checks");
		expect(await screen.findByRole("region", { name: "2 of 3 checks fail" })).toBeVisible();
		const sections = within(screen.getByRole("navigation", { name: "Sections" }));
		expect(sections.getByRole("button", { name: "Checks" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await idle(router);
	});

	it("says No such pull request for an unknown one, and leads back to the list", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-999");
		expect(await screen.findByText("No such pull request")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Pull requests" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/pull-requests"));
		await idle(router);
	});

	it("goes Back to the list with its search and filter kept", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests?q=split&filter=needs");
		await user.click(await screen.findByRole("link", { name: /split the pages/ }));
		await screen.findByRole("heading", { level: 1, name: /split the pages/ });
		await user.click(screen.getByRole("link", { name: "Pull requests" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/pull-requests"));
		expect(router.state.location.search).toEqual({ q: "split", filter: "needs" });
		expect(await screen.findByRole("searchbox", { name: "Search the pull requests" })).toHaveValue(
			"split",
		);
		await idle(router);
	});

	it("searches the list and keeps the text in the address", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await screen.findByRole("button", { name: /health route/ });
		await user.type(
			await screen.findByRole("searchbox", { name: "Search the pull requests" }),
			"empty tok",
		);
		expect(await screen.findByRole("heading", { name: "Open, 1" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /health route/ })).toBeNull();
		expect(screen.getByRole("button", { name: /Rename the Work tab/ })).toBeInTheDocument();
		expect(router.state.location.search).toEqual({ q: "empty tok" });
		await idle(router);
	});

	it("opens the merged and the closed ones for a search from the address", async () => {
		await demo();
		const merged = (await unwrap(commands.pullsList())).find((p) => p.state === "merged");
		if (!merged) throw new Error("the demo has a merged pull request");
		const router = mountApp(`/code/pull-requests?q=${encodeURIComponent(merged.title)}`);
		expect(await screen.findByRole("heading", { name: "Open, 0" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Merged" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: new RegExp(merged.title) })).toBeInTheDocument();
		await idle(router);
	});

	it("filters the list to what needs a review", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await screen.findByRole("button", { name: /health route/ });
		await user.click(screen.getByRole("button", { name: "Needs my review" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ filter: "needs" }));
		// Open, not a draft, lane in_review: its checks still run. A draft, requested changes, an approved pull
		// request that is ready to merge, and a merged one all leave.
		expect(screen.getByRole("button", { name: /split the pages/ })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /health route/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /show the pull requests/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /Rename the Work tab/ })).toBeNull();
		expect(screen.getByRole("heading", { name: "Merged" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "All" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		await idle(router);
	});

	it("keeps the context menu of a row", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/now");
		await user.pointer({ keys: "[MouseRight]", target: await row(/health route/) });
		expect(await screen.findByRole("menuitem", { name: "Open" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Copy ref" })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await idle(router);
	});

	it("shows the draft mark and the state in words on a row, on Now and on the page", async () => {
		await demo();
		const router = mountApp("/code/now");
		const draft = await row(/show the pull requests/);
		expect(within(draft).getByText("Draft")).toBeInTheDocument();
		expect(draft).toHaveAttribute("href", "/code/pull-requests/github-demo-143");
		const failing = await row(/Rename the Work tab/);
		expect(within(failing).getByText("Checks fail")).toBeInTheDocument();
		await userEvent.setup().click(screen.getByRole("link", { name: "Merged and closed" }));
		const onPage = await screen.findByRole("button", { name: /show the pull requests/ });
		expect(within(onPage).getByText("Draft")).toBeInTheDocument();
		expect(
			within(screen.getByRole("button", { name: /Rename the Work tab/ })).getByText("Checks fail"),
		).toBeInTheDocument();
		await idle(router);
	});

	it("says in words whether the pull request can merge", async () => {
		await demo();
		const line = (text: string) => screen.findByText(text, { selector: "p[role=status]" });
		const router = mountApp("/code/pull-requests/github-demo-141");
		await line("Ready to merge");
		const view = screen.getByRole("region", { name: "Merge status" });
		expect(within(view).getByText("1 of 1 pass")).toBeInTheDocument();
		expect(within(view).getByText("0 of 0 solved")).toBeInTheDocument();
		expect(within(view).getByText("1 of 1")).toBeInTheDocument();
		// Each count belongs to its bar: 1 of 1 checks pass (so none fails or waits), 1 of 1 approved.
		for (const [name, now] of [
			["Checks", "1"],
			["Comments", "0"],
			["Approvals", "1"],
		])
			expect(within(view).getByRole("progressbar", { name })).toHaveAttribute("aria-valuenow", now);
		expect(within(view).getByRole("progressbar", { name: "Approvals" })).toHaveAttribute(
			"aria-valuemax",
			"1",
		);
		await idle(router);
	});

	it("names the failing checks that block the merge", async () => {
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		await screen.findByText("Merge is blocked: 2 checks failing, changes requested", {
			selector: "span[role=status]",
		});
		// The sentence is the description of Merge: no line of it shows in the card.
		expect(
			within(screen.getByRole("region", { name: "Merge" })).getByRole("button", {
				name: "Merge pull request",
			}),
		).toHaveAccessibleDescription("Merge is blocked: 2 checks failing, changes requested");
		const view = screen.getByRole("region", { name: "Merge status" });
		expect(within(view).getByText("1 of 3 pass")).toBeInTheDocument();
		expect(within(view).getByText("1 passing, 2 failing, 0 pending")).toBeInTheDocument();
		expect(within(view).getByText("1 of 2 solved")).toBeInTheDocument();
		expect(within(view).getByText("0 of 1")).toBeInTheDocument();
		// 1 of 3 checks pass: the two others fail (the line above names them), none waits. 0 of 1 approved.
		const checks = within(view).getByRole("progressbar", { name: "Checks" });
		expect(checks).toHaveAttribute("aria-valuenow", "1");
		expect(checks).toHaveAttribute("aria-valuemax", "3");
		// 0 of 1 approved: the text "0 of 1" is the Approvals bar, the bar holds the same two numbers.
		const approvals = within(view).getByRole("progressbar", { name: "Approvals" });
		expect(approvals).toHaveAttribute("aria-valuenow", "0");
		expect(approvals).toHaveAttribute("aria-valuemax", "1");
		await idle(router);
	});

	it("says that a draft must be marked ready first", async () => {
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-143");
		await screen.findByText("Draft: mark ready first", { selector: "p[role=status]" });
		await idle(router);
	});

	it("names a conflict with the target branch", async () => {
		await demo();
		await unwrap(commands.codePullDetail(141));
		const mock = mockState().prs?.pulls.find((p) => p.number === 141);
		if (mock) mock.mergeable = "conflict";
		const router = mountApp("/code/pull-requests/github-demo-141");
		await screen.findByText("Merge is blocked: conflicts with the target branch", {
			selector: "p[role=status]",
		});
		await idle(router);
	});

	it("names the risk of a merge with failing checks in a danger confirmation", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		await user.click(await screen.findByRole("button", { name: "Merge pull request" }));
		const confirm = await screen.findByRole("button", {
			name: "Merge with Merge although checks are failing?",
		});
		expect(confirm.className).toContain("bg-danger");
		await idle(router);
	});

	it("keeps Merge off for a draft, marks it ready, then merges after a confirmation that names the method", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-143");
		const merge = await screen.findByRole("button", { name: "Merge pull request" });
		expect(merge).toBeDisabled();
		// Mark ready is in More of the merge card.
		await user.click((await mergeCard()).getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Mark ready" }));
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Merge pull request" })).toBeEnabled(),
		);
		await user.click((await mergeCard()).getByRole("button", { name: "More" }));
		await screen.findByRole("menuitem", { name: "Copy ref" });
		expect(screen.queryByRole("menuitem", { name: "Mark ready" })).toBeNull();
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Merge pull request" }));
		await user.click(await screen.findByRole("button", { name: "Merge with Merge?" }));
		await screen.findByText("Merged", { selector: "p[role=status]" });
		expect(mockState().prs?.pulls.find((p) => p.number === 143)?.state).toBe("merged");
		expect(screen.getByRole("button", { name: "Merge pull request" })).toBeDisabled();
		await idle(router);
	});

	it("lists the merge methods in the split button and merges with the one chosen", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		const methods = within(await screen.findByRole("group", { name: "Method" }));
		expect(methods.getByRole("button", { name: "Merge" })).toHaveAttribute("aria-pressed", "true");
		expect(methods.getByRole("button", { name: "Rebase" })).toBeInTheDocument();
		// The switch chooses the method: Merge asks with it.
		await user.click(methods.getByRole("button", { name: "Squash" }));
		await user.click(screen.getByRole("button", { name: "Merge pull request" }));
		await user.click(await screen.findByRole("button", { name: "Merge with Squash?" }));
		await waitFor(() =>
			expect(mockState().prs?.pulls.find((p) => p.number === 141)?.state).toBe("merged"),
		);
		// The person is told that it worked.
		expect(await screen.findByText("Merged #141 with Squash")).toBeInTheDocument();
		await idle(router);
	});

	it("opens the confirmation with the method that the menu item names, and Cancel merges nothing", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		const methods = within(await screen.findByRole("group", { name: "Method" }));
		await user.click(methods.getByRole("button", { name: "Rebase" }));
		await user.click(screen.getByRole("button", { name: "Merge pull request" }));
		expect(await screen.findByRole("button", { name: "Merge with Rebase?" })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("button", { name: "Merge with Rebase?" })).toBeNull();
		expect(mockState().prs?.pulls.find((p) => p.number === 141)?.state).toBe("open");
		await idle(router);
	});

	it("closes a pull request from the menu after a confirmation", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		await user.click((await mergeCard()).getByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Close pull request" }));
		expect(mockState().prs?.pulls.find((p) => p.number === 141)?.state).toBe("open");
		await user.click(await screen.findByRole("button", { name: "Close #141?" }));
		await waitFor(() =>
			expect(mockState().prs?.pulls.find((p) => p.number === 141)?.state).toBe("closed"),
		);
		await idle(router);
	});

	it("offers Open in browser and Copy ref in the menu", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		await user.click((await mergeCard()).getByRole("button", { name: "More" }));
		expect(await screen.findByRole("menuitem", { name: "Open in browser" })).toBeEnabled();
		expect(screen.getByRole("menuitem", { name: "Copy ref" })).toBeEnabled();
		await user.keyboard("{Escape}");
		await idle(router);
	});

	it("posts a comment and refuses a request for changes with no text", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		await toChat();
		await user.click(await screen.findByRole("button", { name: "Submit review" }));
		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("radio", { name: "Request changes" }));
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		expect(await within(dialog).findByRole("alert")).toHaveTextContent("some text");
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "rename it");
		await user.click(screen.getByRole("button", { name: "Comment" }));
		expect(await screen.findByText("rename it")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Conversation (1)" })).toBeInTheDocument();
		await idle(router);
	});

	it("opens a pull request from the page and shows the forge refusal", async () => {
		const user = userEvent.setup();
		await demo();
		const code = seedCode();
		code.branch = "feat/demo/login";
		code.remoteBranches.push("origin/feat/demo/login");
		mockState().code = code;
		const router = mountApp("/code/pull-requests/new");
		expect(
			await screen.findByRole("heading", { level: 1, name: "New pull request" }),
		).toBeVisible();
		const submit = () => user.click(screen.getByRole("button", { name: "Open the pull request" }));
		await submit();
		expect(await screen.findByRole("alert")).toHaveTextContent("needs a title");
		await user.type(screen.getByRole("textbox", { name: "Title" }), "feat(code): login");
		await user.click(screen.getByRole("combobox", { name: "Into" }));
		await user.click(await screen.findByRole("option", { name: "feat/demo/login" }));
		await submit();
		expect(await screen.findByRole("alert")).toHaveTextContent("its own branch");
		await user.click(screen.getByRole("combobox", { name: "Into" }));
		await user.click(await screen.findByRole("option", { name: "Default branch" }));
		await submit();
		// The page stays: it shows what the person can do with the pull request that exists (REQ-007).
		expect(await screen.findByRole("button", { name: "Close the pull request" })).toBeVisible();
		expect(screen.queryByRole("button", { name: "Mark as ready" })).toBeNull();
		await user.click(screen.getByRole("link", { name: "Pull requests" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/pull-requests"));
		expect(await screen.findByRole("heading", { name: "Open, 10" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /feat\(code\): login/ })).toBeInTheDocument();
		await idle(router);
	});

	it("keeps Draft, the labels and the way back on the new pull request page", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/new");
		await screen.findByRole("heading", { level: 1, name: "New pull request" });
		const draft = screen.getByRole("switch", { name: "Draft" });
		await user.click(draft);
		expect(draft).toBeChecked();
		// The page shows no switch of the place (`spec:app-redesign#REQ-001`).
		expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
		// Labels is one button with a menu of the labels that exist.
		await user.click(screen.getByRole("button", { name: "Labels" }));
		await user.click(await screen.findByRole("menuitemcheckbox", { name: "feat" }));
		await user.keyboard("{Escape}");
		expect(await screen.findByRole("button", { name: "feat" })).toBeInTheDocument();
		await user.click(screen.getByRole("link", { name: "Pull requests" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/pull-requests"));
		await idle(router);
	});
});

describe("New pull request, the cards before the push", () => {
	it("names the files that are not committed, leaves them, and offers Commit them", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/new");
		expect(await screen.findByRole("heading", { name: "Before the push" })).toBeInTheDocument();
		expect(screen.getByText(/files? (is|are) not committed/)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Commit them" })).toHaveAttribute("href", "/code/now");
		await user.click(screen.getByRole("button", { name: "Leave them" }));
		expect(screen.queryByText(/files? (is|are) not committed/)).toBeNull();
		await idle(router);
	});

	it("shows the base that is ahead and the doc that goes stale, with no line under the heading", async () => {
		await demo();
		// The base is one commit ahead of the working branch.
		const status = await unwrap(commands.codeStatus());
		vi.spyOn(commands, "codeStatus").mockResolvedValue({
			status: "ok",
			data: { ...status, behind: 1 },
		});
		const router = mountApp("/code/pull-requests/new");
		expect(await screen.findByText("main is ahead by 1")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Update my branch" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Push as it is" })).toBeInTheDocument();
		expect(await screen.findByRole("heading", { name: "1 doc goes stale" })).toBeInTheDocument();
		// The warning of the default branch is for a screen reader only.
		const warning = screen.getByText(/is the default branch of/);
		expect(warning).toHaveClass("sr-only");
		await idle(router);
	});
});

describe("Code / Pull requests, the author of each row (REQ-008)", () => {
	it("shows the avatar of the person who opened the pull request on each row", async () => {
		await demo();
		await unwrap(commands.pullsList());
		const one = mockState().prs?.pulls.find((p) => p.number === 141);
		if (!one) throw new Error("the demo has pull request 141");
		one.author = "Grace Hopper";
		const router = mountApp("/code/pull-requests");
		const rowOf = async (title: RegExp) =>
			within((await screen.findByRole("button", { name: title })) as HTMLElement);
		expect((await rowOf(/health route/)).getByRole("img", { name: "Grace Hopper" })).toBeVisible();
		expect(
			(await rowOf(/Rename the Work tab/)).getByRole("img", { name: "Ada Lovelace" }),
		).toBeVisible();
		await idle(router);
	});
});

describe("Code / Pull requests, the page", () => {
	it("shows the three cards, the search, the filter and the review of the selected one", async () => {
		await demo();
		const router = mountApp("/code/pull-requests");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Code: Pull requests" }),
		).toBeVisible();
		expect(await screen.findByRole("heading", { name: "Open, 9" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Merged" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Closed" })).toBeInTheDocument();
		expect(
			within(screen.getByRole("main")).getByRole("link", { name: "Code" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "New pull request" })).toHaveAttribute(
			"href",
			"/code/pull-requests/new",
		);
		// The title row keeps the Code switch, with Now chosen.
		const tabs = within(screen.getByRole("navigation", { name: "Tabs" }));
		expect(tabs.getByRole("link", { name: "Now" })).toHaveAttribute("aria-current", "page");
		// The first open pull request is selected: its review panel is on the right.
		const verdict = await screen.findByRole("group", { name: "Verdict" });
		const panel = within(verdict.parentElement as HTMLElement);
		expect(panel.getByRole("button", { name: "Submit review" })).toBeInTheDocument();
		expect(
			await screen.findByRole("button", { name: "Write the description" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open on the code host" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Rename the Work tab" })).toHaveAttribute(
			"href",
			"/code/pull-requests/github-42",
		);
		await idle(router);
	});

	it("selects a row, then opens its page from the panel", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: /health route/ }));
		expect(screen.getByRole("button", { name: /health route/ })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await user.click(await screen.findByRole("link", { name: /health route/ }));
		await waitFor(() =>
			expect(router.state.location.pathname).toMatch(/^\/code\/pull-requests\/github-demo-\d+$/),
		);
		await idle(router);
	});

	it("searches, filters and keeps both in the address", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await screen.findByRole("button", { name: /health route/ });
		await user.type(
			screen.getByRole("searchbox", { name: "Search the pull requests" }),
			"empty tok",
		);
		expect(await screen.findByRole("heading", { name: "Open, 1" })).toBeInTheDocument();
		expect(router.state.location.search).toEqual({ q: "empty tok" });
		await user.clear(screen.getByRole("searchbox", { name: "Search the pull requests" }));
		await user.click(screen.getByRole("button", { name: "Needs my review" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ filter: "needs" }));
		expect(screen.getByRole("button", { name: /split the pages/ })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /health route/ })).toBeNull();
		await idle(router);
	});

	it("keeps the draft mark, the checks and the review states and Copy ref in the panel and the menu", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		const draft = await screen.findByRole("button", { name: /show the pull requests/ });
		expect(within(draft).getByText("Draft")).toBeInTheDocument();
		const before = screen.getAllByText("Draft").length;
		await user.click(draft);
		await waitFor(() => expect(screen.getAllByText("Draft")).toHaveLength(before + 1));
		await user.pointer({ keys: "[MouseRight]", target: draft });
		expect(await screen.findByRole("menuitem", { name: "Copy ref" })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await idle(router);
	});

	it("sends a review from the panel and asks for text with a request for changes", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: /health route/ }));
		const verdict = await screen.findByRole("group", { name: "Verdict" });
		// The assistant has a Message field too: read the one of the panel.
		const panel = within(verdict.parentElement as HTMLElement);
		await user.click(panel.getByRole("button", { name: "Ask for changes" }));
		await user.click(panel.getByRole("button", { name: "Submit review" }));
		expect(await panel.findByRole("alert")).toHaveTextContent("some text");
		await user.type(panel.getByRole("textbox", { name: "Message" }), "rename it");
		await user.click(panel.getByRole("button", { name: "Submit review" }));
		expect(await panel.findByRole("status")).toHaveTextContent("Review sent");
		await idle(router);
	});
});

describe("Pull request conversation", () => {
	const open = async (n = 142) => {
		await demo();
		await unwrap(commands.codePullDetail(n));
		const router = mountApp(`/code/pull-requests/github-demo-${n}`);
		await toChat();
		return router;
	};
	const mockPull = (n: number) => mockState().prs?.pulls.find((p) => p.number === n);
	// A thread button says where it replies, so it differs from the Reply of PrAi.
	const thread = (place: string) => within(screen.getByRole("article", { name: place }));
	const box = () => screen.findByRole("region", { name: "Merge status" });

	it("mixes the comments and the threads in time order", async () => {
		const router = await open();
		await screen.findByRole("heading", { name: "Conversation (4)" });
		const panel = screen.getByRole("region", { name: "Conversation" });
		const text = within(panel).getAllByText(
			/Thanks for the fix|rename this|Pushed a new commit|this branch is dead/,
		);
		expect(text.map((n) => n.textContent?.slice(0, 12))).toEqual([
			"Thanks for t",
			"rename this",
			"Pushed a new",
			"this branch ",
		]);
		const time = within(panel).getAllByText(/^Nov 9, 2026/)[0];
		expect(time).toHaveTextContent(/\d{1,2}:\d{2}/);
		expect(time).toHaveAttribute("datetime", "2026-11-09T16:00:00Z");
		expect(time?.getAttribute("title")).toContain("2026");
		expect(within(panel).getAllByText("src/app.ts:2")[0]).toBeInTheDocument();
		await idle(router);
	});

	it("renders Markdown and never runs a script", async () => {
		await demo();
		await unwrap(commands.codePullDetail(142));
		mockPull(142)?.comments.push({
			id: "C9",
			author: "Eve",
			body: "<script>window.hacked = 1</script>",
			created: "",
		});
		const router = mountApp("/code/pull-requests/github-demo-142");
		await toChat();
		const link = await screen.findByRole("link", { name: "the guide" });
		expect(link).toHaveAttribute("href", "https://example.com/guide");
		expect(screen.getByText("retry()").tagName).toBe("CODE");
		expect(await screen.findByText("<script>window.hacked = 1</script>")).toBeInTheDocument();
		expect(document.querySelector("script[src], article script")).toBeNull();
		expect((window as unknown as { hacked?: number }).hacked).toBeUndefined();
		// No time is shown for a comment that has none.
		const eve = screen.getByText("Eve").parentElement;
		expect(eve?.querySelector("time")).toBeNull();
		await idle(router);
	});

	it("shows nothing for an empty conversation", async () => {
		const router = await open(141);
		await screen.findByRole("textbox", { name: "Comment" });
		expect(screen.queryByRole("heading", { name: /^Conversation/ })).toBeNull();
		await idle(router);
	});

	it("collapses a resolved thread to one line and opens it on click", async () => {
		const user = userEvent.setup();
		const router = await open();
		const line = await screen.findByRole("button", { name: /src\/lib\.ts:7/ });
		expect(line).toHaveAttribute("aria-expanded", "false");
		expect(line).toHaveTextContent("Resolved");
		expect(line).toHaveTextContent("this branch is dead");
		await user.click(line);
		expect(line).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
		await idle(router);
	});

	it("replies to a thread and puts the focus back on Reply", async () => {
		const user = userEvent.setup();
		const router = await open();
		await screen.findByRole("article", { name: "src/app.ts:2" });
		await user.click(thread("src/app.ts:2").getByRole("button", { name: "Reply to src/app.ts:2" }));
		await user.type(screen.getByRole("textbox", { name: "Reply to this thread" }), "fixed in abc");
		await user.click(screen.getByRole("button", { name: "Post reply" }));
		expect(await screen.findByText("fixed in abc")).toBeInTheDocument();
		expect(mockPull(142)?.threads[0]?.comments).toHaveLength(3);
		await waitFor(() =>
			expect(
				thread("src/app.ts:2").getByRole("button", { name: "Reply to src/app.ts:2" }),
			).toHaveFocus(),
		);
		await idle(router);
	});

	it("resolves and reopens a thread, and the merge box count follows", async () => {
		const user = userEvent.setup();
		const router = await open();
		await user.click(await screen.findByRole("button", { name: "Resolve" }));
		// The merge box is in Changes.
		await section(user, "Changes");
		expect(await within(await box()).findByText("2 of 2 solved")).toBeInTheDocument();
		await section(user, "Chat");
		expect(mockPull(142)?.threads[0]?.resolved).toBe(true);
		const rows = await screen.findAllByRole("button", { name: /src\/app\.ts:2/ });
		expect(rows[0]).toHaveAttribute("aria-expanded", "false");
		await user.click(rows[0] as HTMLElement);
		await user.click(await screen.findByRole("button", { name: "Reopen" }));
		await section(user, "Changes");
		expect(await within(await box()).findByText("1 of 2 solved")).toBeInTheDocument();
		await idle(router);
	});

	it("shows a refusal under the thread and keeps the typed reply", async () => {
		const user = userEvent.setup();
		const router = await open();
		await screen.findByRole("article", { name: "src/app.ts:2" });
		await user.click(thread("src/app.ts:2").getByRole("button", { name: "Reply to src/app.ts:2" }));
		const area = screen.getByRole("textbox", { name: "Reply to this thread" });
		await user.type(area, "later");
		const refuse = vi.spyOn(commands, "codePullReply").mockResolvedValueOnce({
			status: "error",
			error: { code: "forge_denied", details: "403", action: null },
		});
		await user.click(screen.getByRole("button", { name: "Post reply" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("The server refused the token");
		expect(area).toHaveValue("later");
		refuse.mockRestore();
		await idle(router);
	});

	it("previews the draft as Markdown and keeps it over a tab change", async () => {
		const user = userEvent.setup();
		const router = await open(141);
		const area = await screen.findByRole("textbox", { name: "Comment" });
		await user.click(area);
		await user.paste("see `x` and [doc](https://example.com/doc)");
		await user.click(screen.getByRole("tab", { name: "Preview" }));
		expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull();
		expect(screen.getByRole("link", { name: "doc" })).toBeInTheDocument();
		await section(user, "Changes");
		await section(user, "Chat");
		expect(await screen.findByRole("textbox", { name: "Comment" })).toHaveValue(
			"see `x` and [doc](https://example.com/doc)",
		);
		await idle(router);
	});

	it("posts a general comment, not a thread, and keeps the draft when the host refuses", async () => {
		const user = userEvent.setup();
		const router = await open(141);
		const post = await screen.findByRole("button", { name: "Comment" });
		expect(post).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "ok");
		await user.click(post);
		await waitFor(() => expect(mockPull(141)?.comments).toHaveLength(1));
		expect(mockPull(141)?.threads).toHaveLength(0);
		// A request for changes with no text is refused in the dialog and the box stays.
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "  ");
		await user.click(screen.getByRole("button", { name: "Submit review" }));
		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("radio", { name: "Request changes" }));
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		expect(await within(dialog).findByRole("alert")).toHaveTextContent("some text");
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("  ");
		await idle(router);
	});

	it("sends one comment on a double click", async () => {
		const user = userEvent.setup();
		const router = await open(141);
		const post = vi
			.spyOn(commands, "codePullComment")
			.mockImplementation(
				() => new Promise((done) => setTimeout(() => done({ status: "ok", data: null }), 50)),
			);
		await user.type(await screen.findByRole("textbox", { name: "Comment" }), "once");
		await user.dblClick(screen.getByRole("button", { name: "Comment" }));
		await waitFor(() => expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue(""));
		expect(post).toHaveBeenCalledTimes(1);
		post.mockRestore();
		await idle(router);
	});

	it("closes from the write box only after a confirmation, with the text as the reason", async () => {
		const user = userEvent.setup();
		const router = await open(141);
		await user.type(await screen.findByRole("textbox", { name: "Comment" }), "not needed");
		await user.click(screen.getByRole("button", { name: "Close pull request" }));
		// Leaving the confirmation cancels it: nothing closed, the text stays.
		await user.tab();
		expect(await screen.findByRole("button", { name: "Close pull request" })).toBeInTheDocument();
		expect(mockPull(141)?.state).toBe("open");
		expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("not needed");
		await user.click(screen.getByRole("button", { name: "Close pull request" }));
		await user.click(await screen.findByRole("button", { name: "Close #141?" }));
		await waitFor(() => expect(mockPull(141)?.state).toBe("closed"));
		expect(mockPull(141)?.comments.map((c) => c.body)).toContain("not needed");
		await idle(router);
	});

	it("keeps the card, the focus and the typed reply over Resolve and Reopen", async () => {
		const user = userEvent.setup();
		const router = await open();
		await screen.findByRole("article", { name: "src/app.ts:2" });
		await user.click(thread("src/app.ts:2").getByRole("button", { name: "Reply to src/app.ts:2" }));
		await user.type(screen.getByRole("textbox", { name: "Reply to this thread" }), "draft text");
		await user.click(thread("src/app.ts:2").getByRole("button", { name: "Resolve" }));
		const line = await screen.findByRole("button", { name: /src\/app\.ts:2/ });
		expect(line).toHaveAttribute("aria-expanded", "false");
		await waitFor(() => expect(line).toHaveFocus());
		await user.click(line);
		expect(screen.getByRole("textbox", { name: "Reply to this thread" })).toHaveValue("draft text");
		await user.click(thread("src/app.ts:2").getByRole("button", { name: "Reopen" }));
		await waitFor(() =>
			expect(thread("src/app.ts:2").getByRole("button", { name: "Resolve" })).toHaveFocus(),
		);
		expect(screen.getByRole("textbox", { name: "Reply to this thread" })).toHaveValue("draft text");
		await idle(router);
	});

	it("names a thread without a file by the conversation", async () => {
		await demo();
		await unwrap(commands.codePullDetail(142));
		mockPull(142)?.threads.push({
			id: "T3",
			resolved: false,
			path: null,
			line: null,
			commentsTotal: 1,
			comments: [{ id: "TC9", author: "Eve", body: "general point", created: "" }],
		});
		const router = mountApp("/code/pull-requests/github-demo-142");
		await toChat();
		const card = await screen.findByRole("article", { name: "the conversation" });
		expect(
			within(card).getByRole("button", { name: "Reply to the conversation" }),
		).toHaveTextContent("Reply");
		await idle(router);
	});

	it("says when the host returned only the newest comments, a part of a thread or fewer threads", async () => {
		await demo();
		await unwrap(commands.codePullDetail(142));
		const p = mockPull(142);
		if (!p) throw new Error("no pull request 142");
		p.commentsTruncated = true;
		p.threadsTruncated = true;
		const first = p.threads[0];
		if (first) first.commentsTotal = 80;
		const router = mountApp("/code/pull-requests/github-demo-142");
		await toChat();
		expect(await screen.findByText("Showing the latest 2 comments")).toBeInTheDocument();
		expect(screen.getByText("Showing the first 2 review threads")).toBeInTheDocument();
		expect(screen.getByText("Showing the last 2 of 80 comments")).toBeInTheDocument();
		await idle(router);
	});

	it("keeps Send back and Close, and approves from Submit review", async () => {
		const user = userEvent.setup();
		const router = await open(143);
		await screen.findByRole("textbox", { name: "Comment" });
		expect(screen.getByRole("button", { name: "Send back to the agent" })).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "fine");
		await user.click(screen.getByRole("button", { name: "Submit review" }));
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByRole("textbox", { name: "Review text" })).toHaveValue("fine");
		await user.click(within(dialog).getByRole("radio", { name: "Approve" }));
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		await waitFor(() =>
			expect(mockPull(143)?.verdicts.some((v) => v.state === "approved")).toBe(true),
		);
		expect(screen.getByRole("button", { name: "Close pull request" })).toBeInTheDocument();
		await idle(router);
	});
});

describe("Pull request address", () => {
	it("builds the address of a pull request from its ref", () => {
		expect(pullHref("pr:github-demo:141")).toEqual({
			to: "/code/pull-requests/$pullId",
			params: { pullId: "github-demo-141" },
			search: {},
		});
		expect(pullOfRef("pr:github-demo:141")?.params).toEqual({ pullId: "github-demo-141" });
		expect(pullOfRef("run:r1")).toBeUndefined();
		expect(pullOfRef("pr:broken")).toBeUndefined();
	});

	it("opens the page of a pull request from a pr: ref", async () => {
		await demo();
		const router = createAppRouter(createMemoryHistory({ initialEntries: ["/home/today"] }));
		routers().push(router);
		const wrapper = ({ children }: { children: ReactNode }) => (
			<Providers>
				<RouterContextProvider router={router}>
					<NotificationsProvider>
						<ShellProvider>{children}</ShellProvider>
					</NotificationsProvider>
				</RouterContextProvider>
			</Providers>
		);
		const { result } = renderHook(() => useShell(), { wrapper });
		await waitFor(() => expect(result.current).toBeTruthy());
		result.current.openRef("pr:github-demo:141");
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/code/pull-requests/github-demo-141"),
		);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("ignores a selection that an old build saved for the list", async () => {
		await demo();
		rememberSelection("code:pull-requests", "pr:github-demo:142");
		const router = mountApp("/code/now");
		await row(/health route/);
		expect(router.state.location.pathname).toBe("/code/now");
		await idle(router);
	});

	it("round-trips the ref of every code host through the address", () => {
		// The ref holds the connection id (lowercase, digits, dashes), never the project path.
		for (const [conn, n] of [
			["github", 44],
			["github-demo", 141],
			["gitlab-2", 7],
			["gitlab-acme-platform-web", 12],
			["azure-devops", 9],
		] as const) {
			const ref = `pr:${conn}:${n}`;
			const { pullId } = pullHref(ref).params;
			expect(pullOfRef(ref)?.params.pullId).toBe(pullId);
			expect(pullNumberOf(pullId)).toBe(n);
			expect(`pr:${pullId.slice(0, pullId.lastIndexOf("-"))}:${pullNumberOf(pullId)}`).toBe(ref);
		}
	});
});

describe("Pull request page limits", () => {
	const line = (text: string) => screen.findByText(text, { selector: "p[role=status]" });
	// The mock builds its pull requests on the first read: read once, then change the one under test.
	const mockPull = async (number: number) => {
		await unwrap(commands.codePullDetail(number));
		return mockState().prs?.pulls.find((p) => p.number === number);
	};

	it("shows what cites the pull request under Cited by, on the page", async () => {
		await demo();
		const doc = Object.keys(mockState().knowledge.files).find((f) =>
			f.endsWith("getting-started.md"),
		);
		const file = doc ? mockState().knowledge.files[doc] : undefined;
		if (file) file.text += "\nThe fix is pr:github-demo:141.\n";
		const router = mountApp("/code/pull-requests/github-demo-141");
		await toStory();
		const side = await screen.findByRole("complementary", { name: "Details" });
		await within(side).findByRole("heading", { name: "Cited by" });
		expect(within(side).getByText(/getting-started/)).toBeInTheDocument();
		await idle(router);
	});

	it("shows the project gate with no project", async () => {
		const router = mountApp("/code/pull-requests/github-demo-141");
		expect(await screen.findByRole("button", { name: "Open a project" })).toBeInTheDocument();
		expect(screen.queryByText("No such pull request")).toBeNull();
		await idle(router);
	});

	it("shows the error with its sentence and a retry, not No such pull request", async () => {
		const user = userEvent.setup();
		await demo();
		const spy = vi.spyOn(commands, "codePullDetail").mockResolvedValueOnce({
			status: "error",
			error: { code: "forge_unreachable", details: "network error: offline", action: null },
		});
		const router = mountApp("/code/pull-requests/github-demo-141");
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"The server did not answer. Check the network, then try again.",
		);
		expect(screen.queryByText("No such pull request")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(await screen.findByRole("heading", { level: 1, name: /health route/ })).toBeVisible();
		spy.mockRestore();
		await idle(router);
	});

	it("says No such pull request when the code host does not know the number", async () => {
		await demo();
		const spy = vi.spyOn(commands, "codePullDetail").mockResolvedValueOnce({
			status: "error",
			error: { code: "forge_missing", details: "not found: acme/web#999", action: null },
		});
		const router = mountApp("/code/pull-requests/github-demo-999");
		expect(await screen.findByText("No such pull request")).toBeInTheDocument();
		spy.mockRestore();
		await idle(router);
	});

	it("says No such pull request for another connection with the same number", async () => {
		await demo();
		const router = mountApp("/code/pull-requests/other-conn-141");
		expect(await screen.findByText("No such pull request")).toBeInTheDocument();
		expect(screen.queryByRole("heading", { level: 1, name: /health route/ })).toBeNull();
		await idle(router);
	});

	it("does not say Ready to merge when the code host has not said yet", async () => {
		await demo();
		const mock = await mockPull(141);
		if (mock) mock.mergeable = "unknown";
		const router = mountApp("/code/pull-requests/github-demo-141");
		await line("Checking whether it can merge");
		expect(screen.queryByText("Ready to merge")).toBeNull();
		expect(
			within(screen.getByRole("region", { name: "Merge status" })).getByRole("img", {
				name: "Checking whether it can merge",
			}),
		).toBeInTheDocument();
		await idle(router);
	});

	it("says the checks run before it says the code host blocks the merge", async () => {
		await demo();
		const mock = await mockPull(141);
		if (mock) {
			mock.mergeable = "blocked";
			mock.ci = "pending";
		}
		const router = mountApp("/code/pull-requests/github-demo-141");
		await line("Checks are still running");
		expect(screen.queryByText("Merge is blocked by the code host")).toBeNull();
		await idle(router);
	});

	it("shows no method arrow and no menu when the code host has one method", async () => {
		await demo();
		const mock = await mockPull(141);
		if (mock) mock.mergeMethods = ["squash"];
		const router = mountApp("/code/pull-requests/github-demo-141");
		await screen.findByRole("button", { name: "Merge pull request" });
		expect(screen.queryByRole("group", { name: "Method" })).toBeNull();
		await idle(router);
	});
	it("keeps the page, the typed text and the refusal when a refetch fails after a write", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		await screen.findByRole("heading", { level: 1, name: /health route/ });
		await toChat();
		await user.type(await screen.findByRole("textbox", { name: "Comment" }), "kept");
		const down = {
			status: "error",
			error: { code: "forge_unreachable", details: "network error: offline", action: null },
		} as const;
		const read = vi.spyOn(commands, "codePullDetail").mockResolvedValue(down);
		const write = vi.spyOn(commands, "codePullComment").mockResolvedValue(down);
		await user.click(screen.getByRole("button", { name: "Comment" }));
		await waitFor(() => expect(read).toHaveBeenCalled());
		expect((await screen.findAllByRole("button", { name: "Retry" })).length).toBeGreaterThan(0);
		expect(screen.getByRole("heading", { level: 1, name: /health route/ })).toBeVisible();
		expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("kept");
		read.mockRestore();
		write.mockRestore();
		await idle(router);
	});

	it("asks for the merge with its method, cancels back to Merge, and merges once on a double click", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		const box = await mergeCard();
		await user.click(box.getByRole("button", { name: "Merge pull request" }));
		expect(box.getByRole("button", { name: "Merge with Merge?" })).toBeVisible();
		await user.click(box.getByRole("button", { name: "Cancel" }));
		expect(box.queryByRole("button", { name: "Merge with Merge?" })).toBeNull();
		expect(box.getByRole("button", { name: "Merge pull request" })).toHaveFocus();
		const merge = vi
			.spyOn(commands, "codePullMerge")
			.mockImplementation(
				() => new Promise((done) => setTimeout(() => done({ status: "ok", data: null }), 50)),
			);
		await user.click(box.getByRole("button", { name: "Merge pull request" }));
		await user.dblClick(box.getByRole("button", { name: "Merge with Merge?" }));
		await waitFor(() => expect(box.queryByRole("button", { name: "Cancel" })).toBeNull());
		expect(merge).toHaveBeenCalledTimes(1);
		await waitFor(() =>
			expect(screen.getByRole("heading", { level: 1, name: /health route/ })).toHaveFocus(),
		);
		merge.mockRestore();
		await idle(router);
	});

	it("names the method in the confirmation when checks fail", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		await user.click(await screen.findByRole("button", { name: "Merge pull request" }));
		expect(
			screen.getByRole("button", { name: "Merge with Merge although checks are failing?" }),
		).toBeVisible();
		await idle(router);
	});
});
