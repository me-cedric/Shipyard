import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockState } from "@/lib/ipc/mock";
import { mountAssistant } from "./harness";

const REF = "spec:auth#REQ-001";
const log = () => within(screen.getByRole("log", { name: "Messages" }));
const context = () => within(screen.getByRole("list", { name: "Context" }));
const threads = () => within(screen.getByRole("list", { name: "Threads" }));
const input = () => screen.getByRole("textbox", { name: "Message" });

/** Types the text and sends it with Enter. */
async function say(user: ReturnType<typeof userEvent.setup>, text: string) {
	await user.type(input(), `${text}{Enter}`);
}

describe("assistant panel: open", () => {
	it("stays out of the page until it opens, then focuses its input", async () => {
		const { again } = await mountAssistant({ open: false });
		const closed = await screen.findByLabelText("Assistant", { selector: "aside" });
		expect(closed).toHaveAttribute("inert");
		expect(closed).toHaveAttribute("data-open", "false");
		again({ open: true });
		expect(await screen.findByRole("complementary", { name: "Assistant" })).toBeInTheDocument();
		await waitFor(() => expect(input()).toHaveFocus());
	});

	it("starts a thread for a project that has none", async () => {
		await mountAssistant();
		expect(threads().getAllByRole("button")).toHaveLength(1);
		expect(threads().getByRole("button", { name: "Untitled" })).toHaveAttribute(
			"aria-current",
			"true",
		);
	});
});

describe("assistant panel: threads", () => {
	it("titles a thread from its first line and sends with Enter", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "What is the plan?");
		expect(await log().findByText("Here is the answer.")).toBeInTheDocument();
		expect(threads().getByRole("button", { name: "What is the plan?" })).toBeInTheDocument();
		expect(input()).toHaveValue("");
	});

	it("keeps one draft for each thread when the person switches", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.type(input(), "first draft");
		await user.click(screen.getByRole("button", { name: "New thread" }));
		await waitFor(() => expect(threads().getAllByRole("button")).toHaveLength(2));
		expect(input()).toHaveValue("");
		await user.type(input(), "second draft");
		const [newer, older] = threads().getAllByRole("button");
		await user.click(older as HTMLElement);
		await waitFor(() => expect(input()).toHaveValue("first draft"));
		await user.click(newer as HTMLElement);
		await waitFor(() => expect(input()).toHaveValue("second draft"));
	});

	it("renames a thread", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.click(screen.getByRole("button", { name: "Rename" }));
		await user.clear(screen.getByRole("textbox", { name: "Rename" }));
		await user.type(screen.getByRole("textbox", { name: "Rename" }), "Export plan{Enter}");
		expect(await threads().findByRole("button", { name: "Export plan" })).toBeInTheDocument();
	});

	it("deletes a thread after a confirm and keeps the others", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "Keep this one");
		await user.click(screen.getByRole("button", { name: "New thread" }));
		await waitFor(() => expect(threads().getAllByRole("button")).toHaveLength(2));
		// Cancel first: nothing goes.
		await user.click(screen.getByRole("button", { name: "Delete" }));
		await user.click(await screen.findByRole("button", { name: "Close" }));
		expect(threads().getAllByRole("button")).toHaveLength(2);
		await user.click(screen.getByRole("button", { name: "Delete" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.click(dialog.getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(threads().getAllByRole("button")).toHaveLength(1));
		expect(threads().getByRole("button", { name: "Keep this one" })).toBeInTheDocument();
	});
});

describe("assistant panel: context", () => {
	it("lists the view and the selected entity and removes each one", async () => {
		const user = userEvent.setup();
		await mountAssistant({ view: "/work/board", selected: REF });
		expect(context().getByText(/\/work\/board/)).toBeInTheDocument();
		expect(context().getByRole("button", { name: new RegExp(`^${REF}`) })).toBeInTheDocument();
		await user.click(context().getByRole("button", { name: `Remove ${REF}` }));
		expect(context().queryByRole("button", { name: new RegExp(`^${REF}`) })).toBeNull();
		await user.click(context().getByRole("button", { name: "Remove /work/board" }));
		expect(context().queryByText(/\/work\/board/)).toBeNull();
	});

	it("adds a ref that the person types after @", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.type(input(), `Look at @${REF} `);
		expect(
			await context().findByRole("button", { name: new RegExp(`^${REF}`) }),
		).toBeInTheDocument();
		expect(input()).toHaveValue("Look at ");
		await user.click(context().getByRole("button", { name: `Remove ${REF}` }));
		await waitFor(() =>
			expect(context().queryByRole("button", { name: new RegExp(`^${REF}`) })).toBeNull(),
		);
	});

	it("adds a ref with Enter", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.type(input(), `@${REF}{Enter}`);
		expect(
			await context().findByRole("button", { name: new RegExp(`^${REF}`) }),
		).toBeInTheDocument();
		// Enter added the ref and sent no turn.
		expect(screen.queryByRole("article")).toBeNull();
	});

	it("refuses a ref that does not resolve and leaves the context as it was", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.type(input(), "@wi:NONE-1 ");
		expect(await screen.findByRole("alert")).toHaveTextContent("wi:NONE-1 does not resolve");
		expect(context().queryByRole("button", { name: /wi:NONE-1/ })).toBeNull();
	});

	it("adds the ref of a RefChip that the person drops on the panel", async () => {
		await mountAssistant();
		const panel = screen.getByRole("complementary", { name: "Assistant" });
		fireEvent.drop(panel, { dataTransfer: { getData: () => REF } });
		expect(
			await context().findByRole("button", { name: new RegExp(`^${REF}`) }),
		).toBeInTheDocument();
	});

	it("sends the context and the reply cites the refs that resolve", async () => {
		const user = userEvent.setup();
		await mountAssistant({ selected: REF });
		await say(user, "Explain this");
		expect(await log().findByText(/It follows/)).toHaveTextContent(REF);
	});
});

describe("assistant panel: reply actions", () => {
	it("copies the reply", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn();
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		await mountAssistant();
		await say(user, "Hello");
		await user.click(await log().findByRole("button", { name: "Copy" }));
		expect(writeText).toHaveBeenCalledWith("Here is the answer.");
	});

	it("inserts at the cursor of the editor that had the focus, and is off without one", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "Hello");
		const insert = await log().findByRole("button", { name: "Insert" });
		expect(insert).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name: "Notes" }), "Note: ");
		await waitFor(() => expect(insert).toBeEnabled());
		await user.click(insert);
		expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Note: Here is the answer.");
	});

	it("opens a cited ref from its RefChip", async () => {
		const user = userEvent.setup();
		const onOpenRef = vi.fn();
		await mountAssistant({ selected: REF, onOpenRef });
		await say(user, "Hello");
		await user.click(await log().findByRole("button", { name: new RegExp(`^${REF}`) }));
		expect(onOpenRef).toHaveBeenCalledWith(REF);
	});

	it("shows a code block with its file name and language and a copy of its own", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn();
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		await mountAssistant();
		await say(user, "code");
		const fig = within(await log().findByRole("figure"));
		expect(fig.getByText("src/hello.ts")).toBeInTheDocument();
		expect(fig.getByText("ts")).toBeInTheDocument();
		await user.click(fig.getByRole("button", { name: "Copy code" }));
		expect(writeText).toHaveBeenCalledWith("export const hello = () => 'hello';");
	});
});

async function pick(user: ReturnType<typeof userEvent.setup>, select: string, option: string) {
	await user.click(screen.getByRole("combobox", { name: select }));
	await user.click(await screen.findByRole("option", { name: option }));
}

describe("assistant panel: modes and failures", () => {
	it("keeps the permission picker off outside agent mode and shows a plan in plan mode", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		expect(screen.getByRole("combobox", { name: "Permission" })).toBeDisabled();
		await pick(user, "Mode", "Plan");
		await say(user, "Plan the export");
		expect(await log().findByText(/^Plan:/)).toBeInTheDocument();
	});

	it("waits for a denied permission, grants it with one action and shows the diff", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await pick(user, "Mode", "Agent");
		expect(screen.getByRole("combobox", { name: "Permission" })).toBeEnabled();
		await say(user, "deny this");
		expect(await log().findByRole("status")).toHaveTextContent("Waiting: Bash(pnpm test)");
		const changed = within(await screen.findByRole("region", { name: "Changed files" }));
		await user.click(changed.getByText("src/hello.ts"));
		const diff = within(changed.getByRole("region", { name: "Diff of src/hello.ts" }));
		expect(diff.getByText("export const bye = () => 'bye';")).toBeInTheDocument();
		await user.click(log().getByRole("button", { name: "Grant" }));
		expect(await log().findByText("I ran pnpm test. All tests pass.")).toBeInTheDocument();
		expect(log().queryByRole("button", { name: "Grant" })).toBeNull();
		expect(log().queryByText(/Waiting/)).toBeInTheDocument();
	});

	it("says in one sentence that the quota is out and retries", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "quota");
		expect(await log().findByRole("alert")).toHaveTextContent("The quota of the runner is out.");
		await user.click(log().getByRole("button", { name: "Retry" }));
		expect(await log().findByText("Here is the answer.")).toBeInTheDocument();
		expect(log().queryByRole("button", { name: "Retry" })).toBeNull();
	});

	it("alerts at 80 percent of a budget and refuses a spent one, keeping the draft", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "alert");
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Budget at 80 % or more: day 2026-10-29",
		);
		await say(user, "spent");
		expect(await screen.findByText("The budget day 2026-10-29 is spent")).toBeInTheDocument();
		await waitFor(() => expect(input()).toHaveValue("spent"));
	});
});

describe("assistant panel: Explain and Send to factory", () => {
	it("explains the selected entity in ask mode with a cited ref", async () => {
		const user = userEvent.setup();
		await mountAssistant({ selected: REF });
		await pick(user, "Mode", "Plan");
		await user.click(screen.getByRole("button", { name: "Explain" }));
		expect(await log().findByText(/part of the project graph/)).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Mode" })).toHaveTextContent("Ask");
		expect(log().getAllByRole("button", { name: new RegExp(`^${REF}`) })).not.toHaveLength(0);
	});

	it("needs the Send button of the dialog to create the work item", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		expect(screen.getByRole("button", { name: "Send to factory" })).toBeDisabled();
		await say(user, "Plan the export");
		await log().findByText("Here is the answer.");
		await user.click(screen.getByRole("button", { name: "Send to factory" }));
		const dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findByText(/^doc:assistant\//)).toBeInTheDocument();
		await user.click(dialog.getByRole("button", { name: "Close" }));
		expect(mockState().assistant.threads[0]?.sent).toBeNull();
	});

	it("sends a thread as a work item with the label of the workflow that the person picks", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "Plan the export");
		await log().findByText("Here is the answer.");
		await user.click(screen.getByRole("button", { name: "Send to factory" }));
		const dialog = within(await screen.findByRole("dialog"));
		await dialog.findByText(/^doc:assistant\//);
		await user.click(dialog.getByRole("combobox", { name: "Workflow" }));
		await user.click(await screen.findByRole("option", { name: "feature" }));
		await user.click(dialog.getByRole("button", { name: "Send" }));
		expect(await dialog.findByRole("status")).toHaveTextContent("Sent SHIP-101 · wf:feature");
	});
});
