import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/ui/test-utils";
import { InlineBox, PendingCard } from "./inline-comment";

const post = vi.hoisted(() => vi.fn());
const add = vi.hoisted(() => vi.fn());

// The pending review is a fake that records the call; the post of one comment is a fake too.
vi.mock("@/lib/code/pending-review", async () => {
	const { useState } = await import("react");
	return {
		usePendingReview: () => ({
			comments: [],
			add,
			update: vi.fn(),
			remove: vi.fn(),
			clear: vi.fn(),
		}),
		usePostLineComment: () => {
			const [error, setError] = useState<string | null>(null);
			const [pending, setPending] = useState(false);
			return {
				pending,
				error,
				post: async (c: unknown) => {
					setPending(true);
					setError(null);
					try {
						await post(c);
					} catch (e) {
						setError("The code host refused the comment");
						throw e;
					} finally {
						setPending(false);
					}
				},
			};
		},
	};
});

const mount = (onClose = vi.fn()) => {
	renderApp(
		<InlineBox reference="pr:x:1" headSha="aaa" path="src/a.ts" line={3} onClose={onClose} />,
	);
	return onClose;
};
const box = () => screen.getByRole("textbox", { name: "Comment on line 3" });

beforeEach(() => {
	post.mockReset();
	add.mockReset();
});

describe("InlineBox", () => {
	it("puts the focus in the textarea and keeps the buttons off until there is text", () => {
		mount();
		expect(box()).toHaveFocus();
		expect(screen.getByRole("button", { name: "Add review comment" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Add single comment" })).toBeDisabled();
	});

	it("adds the text to the pending review with the file, the line and the head, then closes", async () => {
		const user = userEvent.setup();
		const close = mount();
		await user.type(box(), "Use a **const**");
		await user.click(screen.getByRole("button", { name: "Add review comment" }));
		expect(add).toHaveBeenCalledWith({
			path: "src/a.ts",
			line: 3,
			body: "Use a **const**",
			headSha: "aaa",
		});
		expect(close).toHaveBeenCalled();
	});

	it("previews the Markdown", async () => {
		const user = userEvent.setup();
		mount();
		await user.type(box(), "Use **bold**");
		await user.click(screen.getByRole("tab", { name: "Preview" }));
		expect(screen.getByText("bold").tagName).toBe("STRONG");
		expect(screen.queryByRole("textbox")).toBeNull();
	});

	it("posts a single comment at once and closes", async () => {
		const user = userEvent.setup();
		post.mockResolvedValue(undefined);
		const close = mount();
		await user.type(box(), "Now");
		await user.click(screen.getByRole("button", { name: "Add single comment" }));
		expect(post).toHaveBeenCalledWith({ path: "src/a.ts", line: 3, body: "Now", headSha: "aaa" });
		expect(add).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(close).toHaveBeenCalled());
	});

	it("keeps the box and its text open and shows the refusal of the code host", async () => {
		const user = userEvent.setup();
		post.mockRejectedValue(new Error("no"));
		const close = mount();
		await user.type(box(), "Keep me");
		await user.click(screen.getByRole("button", { name: "Add single comment" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("The code host refused the comment");
		expect(box()).toHaveValue("Keep me");
		expect(close).not.toHaveBeenCalled();
	});

	it("closes an empty box on Escape and on Cancel, with no question", async () => {
		const user = userEvent.setup();
		const close = mount();
		await user.keyboard("{Escape}");
		expect(close).toHaveBeenCalledTimes(1);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(close).toHaveBeenCalledTimes(2);
	});

	it("asks before it drops a text, and Escape keeps the text", async () => {
		const user = userEvent.setup();
		const close = mount();
		await user.type(box(), "Draft");
		await user.keyboard("{Escape}");
		expect(close).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(close).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Discard this comment?" }));
		expect(close).toHaveBeenCalled();
	});
});

const C = {
	id: "c1",
	path: "src/a.ts",
	line: 2,
	body: "Old **text**",
	createdAt: "",
	headSha: "aaa",
};

describe("PendingCard", () => {
	it("shows the Pending mark in text, the Markdown body, and no older mark on the same push", () => {
		renderApp(<PendingCard c={C} outdated={false} onSave={vi.fn()} onRemove={vi.fn()} />);
		expect(screen.getByText("Pending")).toBeInTheDocument();
		expect(screen.getByText("text")).toBeInTheDocument();
		expect(screen.queryByText("On an older version")).toBeNull();
	});

	it("says that the comment is on an older version and still shows its text", () => {
		renderApp(<PendingCard c={C} outdated onSave={vi.fn()} onRemove={vi.fn()} />);
		expect(screen.getByText("On an older version")).toBeInTheDocument();
		expect(screen.getByText("text")).toBeInTheDocument();
	});

	it("edits the text and gives the focus back to Edit", async () => {
		const user = userEvent.setup();
		const save = vi.fn();
		renderApp(<PendingCard c={C} outdated={false} onSave={save} onRemove={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Edit the comment on line 2" }));
		const area = screen.getByRole("textbox", { name: "Edit the comment on line 2" });
		await user.clear(area);
		await user.type(area, "New");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(save).toHaveBeenCalledWith("New");
		expect(screen.getByRole("button", { name: "Edit the comment on line 2" })).toHaveFocus();
	});

	it("asks before it deletes a text, and deletes an empty one at once", async () => {
		const user = userEvent.setup();
		const remove = vi.fn();
		const view = renderApp(
			<PendingCard c={C} outdated={false} onSave={vi.fn()} onRemove={remove} />,
		);
		await user.click(screen.getByRole("button", { name: "Delete the comment on line 2" }));
		expect(remove).not.toHaveBeenCalled();
		await user.click(screen.getByRole("button", { name: "Delete this comment?" }));
		expect(remove).toHaveBeenCalledTimes(1);
		view.unmount();
		renderApp(
			<PendingCard c={{ ...C, body: " " }} outdated={false} onSave={vi.fn()} onRemove={remove} />,
		);
		await user.click(screen.getByRole("button", { name: "Delete the comment on line 2" }));
		expect(remove).toHaveBeenCalledTimes(2);
	});
});

void act;
