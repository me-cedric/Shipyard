import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetPendingReview, usePendingReview } from "@/lib/code";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const REF = "pr:github-demo:141";
const mockPull = (n: number) => mockState().prs?.pulls.find((p) => p.number === n);
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

beforeEach(() => {
	localStorage.clear();
	resetPendingReview();
});
afterEach(() => vi.restoreAllMocks());

const h1 = () => screen.findByRole("heading", { level: 1, name: /#141/ });
const barSubmit = async () =>
	within(await screen.findByRole("region", { name: "Pending review" })).getByRole("button", {
		name: "Submit review",
	});

/** The page of pull request 141 with two pending comments: one on a line of the diff, one on a line that is gone. */
async function open(withComments = true) {
	await unwrap(commands.projectsOpen("/mock/demo", false));
	await unwrap(commands.codePullDetail(141));
	const router = mountApp("/code/pull-requests/github-demo-141");
	await h1();
	const store = renderHook(() => usePendingReview(REF));
	const d = mockPull(141);
	if (withComments && d) {
		const path = d.files[0]?.path ?? "";
		act(() => {
			store.result.current.add({ path, line: 1, body: "first\nmore", headSha: d.headSha });
			store.result.current.add({ path, line: 99, body: "gone line", headSha: "0000000" });
		});
	}
	return { router, store };
}

describe("the review bar and Submit review", () => {
	it("shows the bar only with a pending comment, on every tab", async () => {
		const user = userEvent.setup();
		const { router, store } = await open(false);
		expect(screen.queryByRole("region", { name: "Pending review" })).toBeNull();
		const d = mockPull(141);
		act(() => {
			store.result.current.add({ path: "src/a.ts", line: 1, body: "x", headSha: d?.headSha ?? "" });
			store.result.current.add({ path: "src/a.ts", line: 2, body: "y", headSha: d?.headSha ?? "" });
		});
		const bar = await screen.findByRole("region", { name: "Pending review" });
		await user.click(screen.getByRole("tab", { name: /Commits/ }));
		expect(screen.getByRole("region", { name: "Pending review" })).toBeVisible();
		await user.click(within(bar).getByRole("button", { name: "2 pending comments" }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "files" }));
		await idle(router);
	});

	it("discards after a confirmation that names the count", async () => {
		const user = userEvent.setup();
		const { router, store } = await open();
		await user.click(await screen.findByRole("button", { name: "Discard" }));
		await user.click(screen.getByRole("button", { name: "Discard 2 pending comments?" }));
		await waitFor(() => expect(store.result.current.comments).toEqual([]));
		expect(screen.queryByRole("region", { name: "Pending review" })).toBeNull();
		await idle(router);
	});

	it("submits one review with the verdict, marks an older comment and says what went into the text", async () => {
		const user = userEvent.setup();
		const { router, store } = await open();
		await user.click(await barSubmit());
		const dialog = await screen.findByRole("dialog", { name: "Submit review" });
		expect(within(dialog).getByRole("radio", { name: "Comment" })).toHaveFocus();
		const list = within(dialog).getByRole("list", { name: "Pending comments" });
		expect(within(list).getAllByRole("listitem")).toHaveLength(2);
		expect(within(list).getByText("On an older version")).toBeVisible();
		expect(within(list).getByText("first")).toBeVisible();
		await user.click(within(dialog).getByRole("radio", { name: "Approve" }));
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(mockPull(141)?.threads).toHaveLength(1);
		expect(mockPull(141)?.verdicts.some((v) => v.state === "approved")).toBe(true);
		expect(store.result.current.comments).toEqual([]);
		expect(
			await screen.findByText("1 comment was added as text instead of on a line"),
		).toHaveAttribute("role", "status");
		expect(await h1()).toHaveFocus();
		await idle(router);
	});

	it("keeps the comments and the text when the code host refuses", async () => {
		const user = userEvent.setup();
		const { router, store } = await open();
		const spy = vi
			.spyOn(commands, "codePullReviewSubmit")
			.mockResolvedValue({ status: "error", error: "HTTP 401" } as never);
		await user.click(await barSubmit());
		const dialog = await screen.findByRole("dialog");
		await user.type(within(dialog).getByRole("textbox", { name: "Review text" }), "my text");
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
		expect(store.result.current.comments).toHaveLength(2);
		expect(within(dialog).getByRole("textbox", { name: "Review text" })).toHaveValue("my text");
		spy.mockRestore();
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		await idle(router);
	});

	it("approves and requests changes from the dialog with no pending comment", async () => {
		const user = userEvent.setup();
		const { router } = await open(false);
		await user.click(await screen.findByRole("button", { name: "Submit review" }));
		let dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("radio", { name: "Request changes" }));
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		expect(await within(dialog).findByRole("alert")).toHaveTextContent("some text");
		await user.type(within(dialog).getByRole("textbox", { name: "Review text" }), "rename it");
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(mockPull(141)?.verdicts.some((v) => v.state === "changes-requested")).toBe(true);
		await user.click(screen.getByRole("button", { name: "Submit review" }));
		dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("radio", { name: "Approve" }));
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(mockPull(141)?.verdicts.some((v) => v.state === "approved")).toBe(true);
		await idle(router);
	});

	it("turns Submit review off, with the reason, for a viewer", async () => {
		await unwrap(commands.projectsOpen("/mock/demo", false));
		mockState().person = {
			member: "bo",
			found: "email",
			role: "viewer",
			admin: false,
			readOnly: false,
			rights: [],
		};
		const router = mountApp("/code/pull-requests/github-demo-141");
		const button = await screen.findByRole("button", { name: "Submit review" });
		expect(button).toBeDisabled();
		expect(button).toHaveAccessibleDescription("Needs the right code.write (your role: Viewer)");
		await idle(router);
	});
});

describe("a partial result, the kept text and the close guard", () => {
	const dialogOf = () => screen.findByRole("dialog", { name: "Submit review" });

	it("clears what was sent, keeps the failed notes and posts only a comment review next", async () => {
		const user = userEvent.setup();
		const { router, store } = await open();
		const path = mockPull(141)?.files[0]?.path ?? "";
		const spy = vi.spyOn(commands, "codePullReviewSubmit").mockResolvedValueOnce({
			status: "ok",
			data: {
				inline: 1,
				inBody: 0,
				failed: [{ path, line: 99, body: "gone line", headSha: "0000000" }],
			},
		} as never);
		await user.click(await barSubmit());
		let dialog = await dialogOf();
		await user.click(within(dialog).getByRole("radio", { name: "Approve" }));
		await user.type(within(dialog).getByRole("textbox", { name: "Review text" }), "ship it");
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(store.result.current.comments.map((c) => [c.line, c.body])).toEqual([[99, "gone line"]]);
		expect(
			await screen.findByText("1 comment could not be posted and stays pending"),
		).toBeVisible();
		// The verdict is out: the next review is a comment, with no text of the first one.
		await user.click(await barSubmit());
		dialog = await dialogOf();
		expect(within(dialog).getByRole("radio", { name: "Comment" })).toBeChecked();
		expect(within(dialog).getByRole("radio", { name: "Approve" })).toBeDisabled();
		expect(within(dialog).getByRole("radio", { name: "Request changes" })).toBeDisabled();
		expect(within(dialog).getByRole("textbox", { name: "Review text" })).toHaveValue("");
		expect(within(dialog).getByText(/The review was posted/)).toBeVisible();
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		const second = spy.mock.calls[1];
		expect(second?.[1]).toBe("comment");
		expect(second?.[2]).toBe("");
		expect(second?.[3]).toHaveLength(1);
		expect(store.result.current.comments).toEqual([]);
		await idle(router);
	});

	it("sends each note with its own head and the current head on top", async () => {
		const user = userEvent.setup();
		const { router } = await open();
		const spy = vi.spyOn(commands, "codePullReviewSubmit");
		await user.click(await barSubmit());
		const dialog = await dialogOf();
		await user.click(within(dialog).getByRole("button", { name: "Submit review" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		const head = mockPull(141)?.headSha;
		const call = spy.mock.calls[0];
		expect(call?.[4]).toBe(head);
		expect(call?.[3]?.map((n) => n.headSha)).toEqual([head, "0000000"]);
		await idle(router);
	});

	it("keeps the review text and the verdict when the dialog closes, and gives them back", async () => {
		const user = userEvent.setup();
		const { router } = await open();
		await user.click(await barSubmit());
		let dialog = await dialogOf();
		await user.click(within(dialog).getByRole("radio", { name: "Request changes" }));
		await user.type(within(dialog).getByRole("textbox", { name: "Review text" }), "draft text");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(await barSubmit());
		dialog = await dialogOf();
		expect(within(dialog).getByRole("textbox", { name: "Review text" })).toHaveValue("draft text");
		expect(within(dialog).getByRole("radio", { name: "Request changes" })).toBeChecked();
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		await idle(router);
	});

	it("shows the full text of a comment in an expandable row and asks before it deletes one", async () => {
		const user = userEvent.setup();
		const { router, store } = await open();
		await user.click(await barSubmit());
		const dialog = await dialogOf();
		const list = within(dialog).getByRole("list", { name: "Pending comments" });
		const details = list.querySelector("details");
		expect(details).not.toHaveAttribute("open");
		await user.click(within(list).getByText("first"));
		expect(details).toHaveAttribute("open");
		expect(details).toHaveTextContent("more");
		const path = mockPull(141)?.files[0]?.path;
		await user.click(within(list).getByRole("button", { name: `Remove the comment on ${path}:1` }));
		expect(store.result.current.comments).toHaveLength(2);
		await user.click(within(list).getByRole("button", { name: "Delete this comment?" }));
		expect(store.result.current.comments).toHaveLength(1);
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		await idle(router);
	});

	it("counts a pending comment in the close guard of the window", async () => {
		const guard = vi.spyOn(commands, "closeGuardDrafts");
		const { router } = await open();
		await waitFor(() => expect(guard).toHaveBeenCalledWith(1));
		await idle(router);
	});
});

describe("one control each, the limit and the focus", () => {
	it("shows Submit review once on the Overview while the bar shows", async () => {
		const { router } = await open();
		await barSubmit();
		expect(screen.getAllByRole("button", { name: "Submit review" })).toHaveLength(1);
		await idle(router);
	});

	it("says that a review takes 100 comments and keeps Submit off", async () => {
		const user = userEvent.setup();
		const { router, store } = await open(false);
		const d = mockPull(141);
		act(() => {
			for (let n = 1; n <= 101; n++)
				store.result.current.add({
					path: "src/a.ts",
					line: n,
					body: `c${n}`,
					headSha: d?.headSha ?? "",
				});
		});
		expect(await screen.findByRole("button", { name: "101 pending comments" })).toBeVisible();
		await user.click(await barSubmit());
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByRole("alert")).toHaveTextContent(
			"A review takes at most 100 comments: remove 1 to submit",
		);
		expect(within(dialog).getByRole("button", { name: "Submit review" })).toBeDisabled();
		await idle(router);
	});

	it("moves the focus to the title after Discard", async () => {
		const user = userEvent.setup();
		const { router } = await open();
		await user.click(await screen.findByRole("button", { name: "Discard" }));
		await user.click(screen.getByRole("button", { name: "Discard 2 pending comments?" }));
		await waitFor(() =>
			expect(screen.getByRole("heading", { level: 1, name: /#141/ })).toHaveFocus(),
		);
		await idle(router);
	});

	it("keeps the text of an open line box over a tab change and counts it in the close guard", async () => {
		const user = userEvent.setup();
		const guard = vi.spyOn(commands, "closeGuardDrafts");
		const { router } = await open(false);
		const files = () => user.click(screen.getByRole("tab", { name: /Files changed/ }));
		await files();
		const tree = await screen.findByRole("group", { name: "Changed files" });
		await user.click(within(tree).getAllByRole("button").at(-1) as HTMLElement);
		const first = document.querySelector("[data-kind=ctx], [data-kind=add]");
		if (first) await user.hover(first);
		await user.click(await screen.findByRole("button", { name: /Add a comment on line/ }));
		const area = screen.getByRole("textbox", { name: /Comment on line/ });
		await user.type(area, "half");
		await waitFor(() => expect(guard).toHaveBeenCalledWith(1));
		await user.click(screen.getByRole("tab", { name: /Commits/ }));
		await files();
		await user.click(
			within(await screen.findByRole("group", { name: "Changed files" }))
				.getAllByRole("button")
				.at(-1) as HTMLElement,
		);
		expect(await screen.findByRole("textbox", { name: /Comment on line/ })).toHaveValue("half");
		await idle(router);
	});
});
