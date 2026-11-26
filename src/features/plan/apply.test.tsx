import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateWorkItem } from "@/features/work/apply";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";
import { renderApp } from "@/ui/test-utils";

type Router = ReturnType<typeof mountApp>;
const SEND = "/plan/people?page=send";
/** The page of the send, read again from People: the preview is new each time. */
const openApply = async (router: Router) => {
	await router.navigate({ to: "/plan/people" });
	await router.navigate({ to: "/plan/people", search: { page: "send" } as never });
	return sendPage();
};
const idle = (router: Router) => waitFor(() => expect(router.state.status).toBe("idle"));
/** The page area: the Ask bar above it has a Send of its own. */
const sendPage = async () => {
	await screen.findByRole("heading", { level: 1, name: "Send the plan to the issue tracker" });
	return within(screen.getByRole("main"));
};
const written = () => Object.keys(mockState().work.written);

describe("the apply preview and apply", () => {
	it("shows the rows to create and writes nothing before the person applies", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/people");
		// The send is a page of People, with the way back.
		await user.click(await screen.findByRole("button", { name: "Send to the issue tracker" }));
		await waitFor(() => expect(router.state.location.search).toMatchObject({ page: "send" }));
		const dialog = await sendPage();
		expect(await dialog.findByRole("heading", { name: "Create, 8" })).toBeInTheDocument();
		// The way back is the first link of the page: the section switch has a link of this name too.
		expect(dialog.getAllByRole("link", { name: "People" })[0]).toHaveAttribute(
			"href",
			"/plan/people",
		);
		expect(
			dialog.getByRole("heading", { name: "This writes 8 tickets in the issue tracker" }),
		).toBeInTheDocument();
		// 2 features (epics) and 6 tasks (stories).
		expect(dialog.getAllByText("Epic")).toHaveLength(2);
		expect(dialog.getAllByText("Story")).toHaveLength(6);
		await user.click(dialog.getByRole("link", { name: "Cancel" }));
		await waitFor(() => expect(router.state.location.search).not.toHaveProperty("page"));
		expect(written()).toHaveLength(0);
		await idle(router);
	});

	it("writes each row, shows each result, and a second apply creates no duplicate", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp(SEND);
		let dialog = await sendPage();
		await dialog.findByRole("heading", { name: "Create, 8" });
		await user.click(dialog.getByRole("button", { name: "Send" }));
		expect(await dialog.findByRole("heading", { name: "Written, 8" })).toBeInTheDocument();
		expect(written()).toHaveLength(8);
		// The send gives way to the counts of the result.
		expect(dialog.queryByRole("button", { name: "Send" })).toBeNull();
		expect(dialog.getByRole("heading", { name: "After the send" })).toBeInTheDocument();
		dialog = await openApply(router);
		expect(await dialog.findByRole("heading", { name: "No change, 8" })).toBeInTheDocument();
		expect(dialog.getByRole("button", { name: "Send" })).toBeDisabled();
		expect(written()).toHaveLength(8);
		await idle(router);
	});

	it("keeps the rows that were written when one row fails, and shows the failed row", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.failRows = ["est:mvp-1#auth-api"];
		mountApp(SEND);
		const dialog = await sendPage();
		await dialog.findByRole("heading", { name: "Create, 8" });
		await user.click(dialog.getByRole("button", { name: "Send" }));
		expect(await dialog.findByRole("heading", { name: "Failed, 1" })).toBeInTheDocument();
		expect(dialog.getByText(/the issue tracker refused the change/)).toBeInTheDocument();
		expect(written()).toContain("est:mvp-1#auth");
		expect(written()).toContain("est:mvp-1#auth-design");
		expect(written()).not.toContain("est:mvp-1#auth-api");
		expect(dialog.getByRole("heading", { name: "Written, 7" })).toBeInTheDocument();
		// The failed row goes again on a click, and the written rows stay.
		mockState().work.failRows = [];
		await user.click(dialog.getByRole("button", { name: "Try again" }));
		expect(await dialog.findByRole("heading", { name: "Written, 8" })).toBeInTheDocument();
		expect(written()).toHaveLength(8);
	});

	it("reads the effort of the sheet again: a changed task shows as an update", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp(SEND);
		let dialog = await sendPage();
		await dialog.findByRole("heading", { name: "Create, 8" });
		await user.click(dialog.getByRole("button", { name: "Send" }));
		await dialog.findByRole("heading", { name: "Written, 8" });
		const sheet = (await unwrap(commands.estimateGet("mvp-1"))).sheet;
		await unwrap(
			commands.estimateSave("mvp-1", {
				...sheet,
				features: sheet.features.map((f) => ({
					...f,
					tasks: f.tasks.map((t) => (t.id === "export-api" ? { ...t, days: 7 } : t)),
				})),
			}),
		);
		dialog = await openApply(router);
		// The task and the test task, which is a share of the build effort.
		expect(await dialog.findByRole("heading", { name: "Change, 2" })).toBeInTheDocument();
		expect(dialog.getAllByText("Estimate")).toHaveLength(2);
		expect(dialog.getByRole("heading", { name: "No change, 6" })).toBeInTheDocument();
		await idle(router);
	});
});

// spec:app-redesign#REQ-019
describe("the preview before the plan goes to the issue tracker", () => {
	it("lists what it creates, what it changes and what stays, and writes nothing", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp(SEND);
		let dialog = await sendPage();
		await dialog.findByRole("heading", { name: "Create, 8" });
		// The last row stays out of the first send: the next preview creates it.
		await user.click(dialog.getAllByRole("checkbox")[7] as HTMLElement);
		await user.click(dialog.getByRole("button", { name: "Send" }));
		await dialog.findByRole("heading", { name: "Written, 7" });
		const sheet = (await unwrap(commands.estimateGet("mvp-1"))).sheet;
		await unwrap(
			commands.estimateSave("mvp-1", {
				...sheet,
				features: sheet.features.map((f) => ({
					...f,
					tasks: f.tasks.map((t) => (t.id === "auth-api" ? { ...t, days: 9 } : t)),
				})),
			}),
		);
		dialog = await openApply(router);
		expect(await dialog.findByRole("heading", { name: "Create, 1" })).toBeInTheDocument();
		expect(dialog.getByRole("heading", { name: /^Change, \d$/ })).toBeInTheDocument();
		expect(dialog.getByRole("heading", { name: /^No change, \d$/ })).toBeInTheDocument();
		expect(written()).toHaveLength(7);
		await idle(router);
	});
});

describe("the review of each row before the write", () => {
	it("writes the rows that were approved, with the title that was edited, and drops the others", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp(SEND);
		const dialog = await sendPage();
		await dialog.findByRole("heading", { name: "Create, 8" });
		const boxes = dialog.getAllByRole("checkbox");
		expect(boxes).toHaveLength(8);
		await user.click(boxes[7] as HTMLElement);
		await user.click(dialog.getByRole("button", { name: "Edit Authentication" }));
		const title = dialog.getByRole("textbox", { name: "Title of Authentication" });
		await user.clear(title);
		await user.type(title, "Sign in");
		await user.click(dialog.getByRole("button", { name: "Send" }));
		expect(await dialog.findByRole("heading", { name: "Written, 7" })).toBeInTheDocument();
		expect(written()).toHaveLength(7);
		expect(mockState().work.written["est:mvp-1#auth"]?.row.title).toBe("Sign in");
		expect(dialog.queryByRole("checkbox")).toBeNull();
	});

	it("writes nothing when every row is dropped", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp(SEND);
		const dialog = await sendPage();
		await dialog.findAllByRole("checkbox");
		for (let i = 0; i < 8; i++) await user.click(dialog.getAllByRole("checkbox")[i] as HTMLElement);
		expect(dialog.getByRole("button", { name: "Send" })).toBeDisabled();
		expect(written()).toHaveLength(0);
	});

	it("refuses an empty title and a call with no click", async () => {
		await withTracker();
		const slugs = ["mvp-1"];
		await expect(
			unwrap(
				commands.applyRunRows(
					slugs,
					[{ reference: "est:mvp-1#auth", title: "", days: null }],
					true,
				),
			),
		).rejects.toBeDefined();
		await expect(
			unwrap(
				commands.applyRunRows(
					slugs,
					[{ reference: "est:mvp-1#auth", title: "A", days: null }],
					false,
				),
			),
		).rejects.toBeDefined();
		expect(written()).toHaveLength(0);
	});
});

describe("Create work item", () => {
	it("creates one item from a ref after one click, and a second click creates none", async () => {
		const user = userEvent.setup();
		await withTracker();
		renderApp(<CreateWorkItem refId="diagram:context" title="Context diagram" />);
		await user.click(await screen.findByRole("button", { name: "Create a ticket" }));
		let dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findByRole("heading", { name: "Create (1)" })).toBeInTheDocument();
		// The preview alone writes nothing.
		expect(written()).toHaveLength(0);
		await user.click(dialog.getByRole("button", { name: "Apply" }));
		expect(await dialog.findByRole("heading", { name: "Written (1)" })).toBeInTheDocument();
		expect(mockState().work.written["diagram:context"]?.row.title).toBe("Context diagram");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(screen.getByRole("button", { name: "Create a ticket" }));
		dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findByRole("heading", { name: "Unchanged (1)" })).toBeInTheDocument();
		expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
		expect(written()).toHaveLength(1);
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		renderApp(<CreateWorkItem refId="diagram:context" title="Contexte" />);
		expect(await screen.findByRole("button", { name: "Créer un ticket" })).toBeInTheDocument();
	});
});
