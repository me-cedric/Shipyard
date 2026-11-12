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
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

describe("Code / Pull requests", () => {
	it("lists the mirror by state with counts", async () => {
		await demo();
		mountApp("/code/pull-requests");
		await row(/health route/);
		expect(screen.getByRole("heading", { name: "Open (9)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Merged (1)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Closed (1)" })).toBeInTheDocument();
		expect(screen.getAllByRole("img", { name: "CI failing" }).length).toBeGreaterThan(0);
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
		mountApp("/code/pull-requests");
		expect(screen.queryByRole("button", { name: "New pull request" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "Connect" }));
		expect(await screen.findByRole("combobox", { name: "Type" })).toHaveTextContent("Code host");
	});

	it("offers New pull request, not Connect, when the code host works and has no pull request", async () => {
		const user = userEvent.setup();
		await emptyProject();
		await codeHost();
		mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: "New pull request" }));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
	});

	it("shows the error of the code host with its action instead of an empty state", async () => {
		await emptyProject();
		const c = await codeHost();
		mockState().sync.failures[c.id] = "HTTP 401";
		mountApp("/code/pull-requests");
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
		mountApp("/code/pull-requests");
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
		spy.mockRestore();
	});

	it("opens a pull request as a page with its address, header and tabs", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await user.click(await row(/refuse an empty token/));
		expect(
			await screen.findByRole("heading", { level: 1, name: /refuse an empty token/ }),
		).toBeVisible();
		expect(router.state.location.pathname).toBe("/code/pull-requests/github-demo-142");
		expect(screen.getByText("feat/demo/pr-142")).toBeInTheDocument();
		expect(screen.getByText("main", { selector: "header span" })).toBeInTheDocument();
		expect(screen.getByTitle("Lines added")).toHaveTextContent("+1");
		expect(screen.getByTitle("Lines removed")).toHaveTextContent("−0");
		for (const name of ["Overview", "Commits (1)", "Checks (3)", "Files changed (1)"])
			expect(screen.getByRole("tab", { name })).toBeInTheDocument();
		// Pull requests stays the selected tab of the Code bar.
		const bar = screen.getByRole("navigation", { name: "Tabs" });
		expect(within(bar).getByRole("link", { name: "Pull requests", current: "page" })).toBeVisible();
		await idle(router);
	});

	it("shows the conversation, the reviewers and the links in the Overview", async () => {
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		expect(await screen.findByRole("heading", { name: "Conversation (4)" })).toBeInTheDocument();
		expect(screen.getByText("rename this")).toBeInTheDocument();
		const side = screen.getByRole("complementary", { name: "Details" });
		expect(within(side).getByText("Grace Hopper")).toBeInTheDocument();
		expect(within(side).getByText("Changes requested")).toBeInTheDocument();
		expect(within(side).getByText(/wi:SHIP-42/)).toBeInTheDocument();
		// The data has no assignee, project or milestone.
		expect(screen.queryByText(/assignee|milestone/i)).toBeNull();
		expect(screen.getByRole("button", { name: "Review with an agent" })).toBeInTheDocument();
		await idle(router);
	});

	it("keeps the tab in the address and shows each tab", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		await user.click(await screen.findByRole("tab", { name: "Commits (1)" }));
		expect(router.state.location.search).toEqual({ tab: "commits" });
		const commits = await screen.findByRole("region", { name: "Commits" });
		expect(within(commits).getByText("fix(auth): refuse an empty token")).toBeInTheDocument();
		await user.click(screen.getByRole("tab", { name: "Checks (3)" }));
		const checks = await screen.findByRole("region", { name: "Checks" });
		// Failing first, and a check with a web address is a link.
		expect(
			within(checks)
				.getAllByRole("link")
				.map((a) => a.textContent),
		).toEqual(["unit", "lint", "build"]);
		expect(within(checks).getByRole("link", { name: "unit" })).toHaveAttribute(
			"href",
			"https://ci.example.com/unit",
		);
		expect(within(checks).getAllByRole("img", { name: "Failing" })).toHaveLength(2);
		await user.click(screen.getByRole("tab", { name: "Files changed (1)" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ tab: "files" }));
		await user.click(screen.getByRole("tab", { name: "Overview" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		await idle(router);
	});

	it("opens a tab from its address", async () => {
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142?tab=checks");
		expect(await screen.findByRole("heading", { name: "Checks (3)" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "Checks (3)", selected: true })).toBeInTheDocument();
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
		await user.click(await row(/split the pages/));
		await screen.findByRole("heading", { level: 1, name: /split the pages/ });
		await user.click(screen.getByRole("link", { name: "Back" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/code/pull-requests"));
		expect(router.state.location.search).toEqual({ q: "split", filter: "needs" });
		expect(await screen.findByRole("searchbox", { name: "Search pull requests" })).toHaveValue(
			"split",
		);
		await idle(router);
	});

	it("searches the list and keeps the text in the address", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await row(/health route/);
		await user.type(screen.getByRole("searchbox", { name: "Search pull requests" }), "empty tok");
		expect(await screen.findByRole("heading", { name: "Open (1)" })).toBeInTheDocument();
		expect(screen.queryByRole("link", { name: /health route/ })).toBeNull();
		expect(screen.getByRole("link", { name: /refuse an empty token/ })).toBeInTheDocument();
		expect(router.state.location.search).toEqual({ q: "empty tok" });
		await idle(router);
	});

	it("filters the list to what needs a review", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await row(/health route/);
		await user.click(screen.getByRole("button", { name: "Needs review" }));
		await waitFor(() => expect(router.state.location.search).toEqual({ filter: "needs" }));
		// Open, not a draft, lane in_review: its checks still run. A draft, requested changes, an approved pull
		// request that is ready to merge, and a merged one all leave.
		expect(screen.getByRole("link", { name: /split the pages/ })).toBeInTheDocument();
		expect(screen.queryByRole("link", { name: /health route/ })).toBeNull();
		expect(screen.queryByRole("link", { name: /show the pull requests/ })).toBeNull();
		expect(screen.queryByRole("link", { name: /refuse an empty token/ })).toBeNull();
		expect(screen.getByRole("heading", { name: "Merged (0)" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "All" }));
		await waitFor(() => expect(router.state.location.search).toEqual({}));
		await idle(router);
	});

	it("keeps the context menu of a row", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests");
		await user.pointer({ keys: "[MouseRight]", target: await row(/health route/) });
		expect(await screen.findByRole("menuitem", { name: "Open" })).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "Copy ref" })).toBeInTheDocument();
		await user.keyboard("{Escape}");
		await idle(router);
	});

	it("shows the number, the draft mark and the checks and review chips on a row", async () => {
		await demo();
		const router = mountApp("/code/pull-requests");
		const draft = await row(/show the pull requests/);
		expect(within(draft).getByText("Draft")).toBeInTheDocument();
		expect(within(draft).getByText(/^#143$/)).toBeInTheDocument();
		expect(draft).toHaveAttribute("href", "/code/pull-requests/github-demo-143");
		const failing = await row(/refuse an empty token/);
		expect(within(failing).getByRole("img", { name: "CI failing" })).toBeInTheDocument();
		expect(within(failing).getByRole("img", { name: "Changes requested" })).toBeInTheDocument();
		await idle(router);
	});

	it("says in words whether the pull request can merge", async () => {
		await demo();
		const line = (text: string) => screen.findByText(text, { selector: "p[role=status]" });
		const router = mountApp("/code/pull-requests/github-demo-141");
		await line("Ready to merge");
		const view = screen.getByRole("region", { name: "Merge status" });
		expect(within(view).getByText("1 passing, 0 failing, 0 pending")).toBeInTheDocument();
		expect(within(view).getByText("0 unresolved of 0")).toBeInTheDocument();
		expect(within(view).getByText("1 of 1 approved")).toBeInTheDocument();
		await idle(router);
	});

	it("names the failing checks that block the merge", async () => {
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-142");
		await screen.findByText("Merge is blocked: 2 checks failing, changes requested", {
			selector: "p[role=status]",
		});
		const view = screen.getByRole("region", { name: "Merge status" });
		expect(within(view).getByText("1 passing, 2 failing, 0 pending")).toBeInTheDocument();
		expect(within(view).getByText("1 unresolved of 2")).toBeInTheDocument();
		expect(within(view).getByText("0 of 1 approved")).toBeInTheDocument();
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
		await user.click(await screen.findByRole("button", { name: "Merge" }));
		const confirm = await screen.findByRole("button", { name: "Merge with failing checks" });
		expect(confirm.className).toContain("bg-danger");
		await idle(router);
	});

	it("keeps Merge off for a draft, marks it ready, then merges after a confirmation that names the method", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-143");
		const merge = await screen.findByRole("button", { name: "Merge" });
		expect(merge).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Mark ready" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Merge" })).toBeEnabled());
		expect(screen.queryByRole("button", { name: "Mark ready" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Merge" }));
		await user.click(await screen.findByRole("button", { name: "Merge with Merge" }));
		await screen.findByText("Merged", { selector: "p[role=status]" });
		expect(mockState().prs?.pulls.find((p) => p.number === 143)?.state).toBe("merged");
		expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
		await idle(router);
	});

	it("lists the merge methods in the split button and merges with the one chosen", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		await user.click(await screen.findByRole("button", { name: "Method" }));
		expect(await screen.findByRole("menuitemcheckbox", { name: "Merge" })).toBeChecked();
		expect(screen.getByRole("menuitemcheckbox", { name: "Rebase" })).toBeInTheDocument();
		await user.click(screen.getByRole("menuitemcheckbox", { name: "Squash" }));
		await user.click(screen.getByRole("button", { name: "Merge" }));
		await user.click(await screen.findByRole("button", { name: "Merge with Squash" }));
		await waitFor(() =>
			expect(mockState().prs?.pulls.find((p) => p.number === 141)?.state).toBe("merged"),
		);
		await idle(router);
	});

	it("closes a pull request from the menu after a confirmation", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		await user.click(await screen.findByRole("button", { name: "More" }));
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
		await user.click(await screen.findByRole("button", { name: "More" }));
		expect(await screen.findByRole("menuitem", { name: "Open in browser" })).toBeEnabled();
		expect(screen.getByRole("menuitem", { name: "Copy ref" })).toBeEnabled();
		await user.keyboard("{Escape}");
		await idle(router);
	});

	it("posts a comment and refuses a request for changes with no text", async () => {
		const user = userEvent.setup();
		await demo();
		const router = mountApp("/code/pull-requests/github-demo-141");
		await user.click(await screen.findByRole("button", { name: "Request changes" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("some text");
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "rename it");
		await user.click(screen.getByRole("button", { name: "Comment" }));
		expect(await screen.findByText("rename it")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Conversation (1)" })).toBeInTheDocument();
		await idle(router);
	});

	it("opens a pull request from the form and shows the forge refusal", async () => {
		const user = userEvent.setup();
		await demo();
		const code = seedCode();
		code.branch = "feat/demo/login";
		code.remoteBranches.push("origin/feat/demo/login");
		mockState().code = code;
		mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: "Open pull request" }));
		const form = await screen.findByRole("dialog");
		const submit = () =>
			user.click(within(form).getByRole("button", { name: "Open pull request" }));
		await submit();
		expect(await within(form).findByRole("alert")).toHaveTextContent("needs a title");
		await user.type(within(form).getByRole("textbox", { name: "Title" }), "feat(code): login");
		await user.type(within(form).getByRole("textbox", { name: "Base" }), "feat/demo/login");
		await submit();
		expect(await within(form).findByRole("alert")).toHaveTextContent("its own branch");
		await user.clear(within(form).getByRole("textbox", { name: "Base" }));
		await submit();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(await screen.findByRole("heading", { name: "Open (10)" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /feat\(code\): login/ })).toBeInTheDocument();
	});
});

describe("Pull request conversation", () => {
	const open = async (n = 142) => {
		await demo();
		await unwrap(commands.codePullDetail(n));
		return mountApp(`/code/pull-requests/github-demo-${n}`);
	};
	const mockPull = (n: number) => mockState().prs?.pulls.find((p) => p.number === n);
	// A thread button says where it replies, so it differs from the Reply of PrAi.
	const thread = (place: string) => within(screen.getByRole("article", { name: place }));
	const box = () => screen.getByRole("region", { name: "Merge status" });

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
		await screen.findByRole("region", { name: "Merge status" });
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
		expect(await within(box()).findByText("0 unresolved of 2")).toBeInTheDocument();
		expect(mockPull(142)?.threads[0]?.resolved).toBe(true);
		const rows = await screen.findAllByRole("button", { name: /src\/app\.ts:2/ });
		expect(rows[0]).toHaveAttribute("aria-expanded", "false");
		await user.click(rows[0] as HTMLElement);
		await user.click(await screen.findByRole("button", { name: "Reopen" }));
		expect(await within(box()).findByText("1 unresolved of 2")).toBeInTheDocument();
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
		await user.click(screen.getByRole("tab", { name: "Files changed (1)" }));
		await user.click(await screen.findByRole("tab", { name: "Overview" }));
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
		// A request for changes with no text is refused and the box stays.
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "  ");
		await user.click(screen.getByRole("button", { name: "Request changes" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("some text");
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
		expect(await screen.findByText("Showing the latest 2 comments")).toBeInTheDocument();
		expect(screen.getByText("Showing the first 2 review threads")).toBeInTheDocument();
		expect(screen.getByText("Showing the last 2 of 80 comments")).toBeInTheDocument();
		await idle(router);
	});

	it("keeps Approve, Send back and Close", async () => {
		const user = userEvent.setup();
		const router = await open(143);
		await screen.findByRole("textbox", { name: "Comment" });
		expect(screen.getByRole("button", { name: "Send back to the agent" })).toBeInTheDocument();
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "fine");
		await user.click(screen.getByRole("button", { name: "Approve" }));
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
		const router = mountApp("/code/pull-requests");
		await row(/health route/);
		expect(router.state.location.pathname).toBe("/code/pull-requests");
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
		const side = await screen.findByRole("complementary", { name: "Details" });
		await within(side).findByRole("heading", { name: "Cited by" });
		expect(within(side).getByText(/getting-started/)).toBeInTheDocument();
		await idle(router);
	});

	it("shows the project gate with no project", async () => {
		const router = mountApp("/code/pull-requests/github-demo-141");
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
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
		expect(screen.getByRole("img", { name: "Checking whether it can merge" })).toBeInTheDocument();
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
		await screen.findByRole("button", { name: "Merge" });
		expect(screen.queryByRole("button", { name: "Method" })).toBeNull();
		await idle(router);
	});
});
