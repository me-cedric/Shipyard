import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { withTracker } from "@/test/tracker";
import { SpecChanges } from "./index";
import { renderSpecs } from "./test-harness";

type User = ReturnType<typeof userEvent.setup>;
const written = () => Object.keys(mockState().work.written);
const startSplit = async (user: User) => {
	await user.click(await screen.findByRole("button", { name: /^add-auth/ }));
	await user.click(await screen.findByRole("button", { name: "Split" }));
	return within(await screen.findByRole("dialog"));
};

describe("Specs / Split", () => {
	it("shows each item with its requirement refs, and the apply covers what the PM kept", async () => {
		const user = userEvent.setup();
		await withTracker();
		await renderSpecs(<SpecChanges />);
		const review = await startSplit(user);
		const story = await review.findByRole("group", { name: "sessions-req-001" });
		expect(within(story).getByRole("button", { name: /spec:sessions#REQ-001/ })).toBeVisible();
		await user.click(review.getByRole("button", { name: "Remove sessions-req-002" }));
		await user.click(review.getByRole("button", { name: "Preview" }));
		// One epic and one story are left. The preview writes nothing.
		const apply = within(await screen.findByRole("dialog"));
		expect(await apply.findByRole("heading", { name: "Create (2)" })).toBeVisible();
		expect(written()).toHaveLength(0);
	});

	it("removes the stories of a removed epic, so the apply has no missing parent", async () => {
		const user = userEvent.setup();
		await withTracker();
		await renderSpecs(<SpecChanges />);
		const review = await startSplit(user);
		await review.findByRole("group", { name: "sessions-req-001" });
		await user.click(review.getByRole("button", { name: "Remove sessions" }));
		expect(review.queryByRole("group", { name: "sessions-req-001" })).toBeNull();
		expect(review.queryByRole("group", { name: "sessions-req-002" })).toBeNull();
		await user.click(review.getByRole("button", { name: "Preview" }));
		const apply = within(await screen.findByRole("dialog"));
		await waitFor(() => expect(apply.queryByText(/parent missing/)).toBeNull());
	});

	it("adds an item and edits a title before the preview", async () => {
		const user = userEvent.setup();
		await withTracker();
		await renderSpecs(<SpecChanges />);
		const review = await startSplit(user);
		await review.findByRole("group", { name: "sessions" });
		await user.type(review.getByRole("textbox", { name: "Requirements" }), "spec:sessions#REQ-001");
		const add = review.getByRole("form", { name: "Add" });
		await user.type(within(add).getByRole("textbox", { name: "Title" }), "Extra");
		await user.click(within(add).getByRole("button", { name: "Add" }));
		const extra = await review.findByRole("group", { name: "extra" });
		await user.type(within(extra).getByRole("textbox", { name: "Title" }), "!");
		await user.click(review.getByRole("button", { name: "Preview" }));
		const apply = within(await screen.findByRole("dialog"));
		expect(await apply.findByRole("heading", { name: "Create (4)" })).toBeVisible();
		expect(apply.getByText("Extra!")).toBeVisible();
	});

	it("writes after the click, and a second apply creates no duplicate", async () => {
		const user = userEvent.setup();
		await withTracker();
		await renderSpecs(<SpecChanges />);
		let review = await startSplit(user);
		await user.click(await review.findByRole("button", { name: "Preview" }));
		let apply = within(await screen.findByRole("dialog"));
		await user.click(await apply.findByRole("button", { name: "Apply" }));
		expect(await apply.findByRole("heading", { name: "Written (3)" })).toBeVisible();
		expect(written()).toContain("est:add-auth#sessions");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(screen.getByRole("button", { name: "Split" }));
		review = within(await screen.findByRole("dialog"));
		await user.click(await review.findByRole("button", { name: "Preview" }));
		apply = within(await screen.findByRole("dialog"));
		expect(await apply.findByRole("heading", { name: "Unchanged (3)" })).toBeVisible();
		expect(apply.getByRole("button", { name: "Apply" })).toBeDisabled();
		expect(written()).toHaveLength(3);
	});

	it("blocks the apply when an item cites an unknown requirement", async () => {
		const user = userEvent.setup();
		await withTracker();
		await renderSpecs(<SpecChanges />);
		const review = await startSplit(user);
		await user.type(review.getByRole("textbox", { name: "Requirements" }), "spec:sessions#REQ-999");
		const add = review.getByRole("form", { name: "Add" });
		await user.type(within(add).getByRole("textbox", { name: "Title" }), "Bad");
		await user.click(within(add).getByRole("button", { name: "Add" }));
		await user.click(review.getByRole("button", { name: "Preview" }));
		const apply = within(await screen.findByRole("dialog"));
		expect(await apply.findByRole("alert")).toHaveTextContent("unknown ref spec:sessions#REQ-999");
		expect(apply.getByRole("button", { name: "Apply" })).toBeDisabled();
	});
});

describe("Specs / Archive", () => {
	it("archives a change with no work item and moves its capability to the settled ones", async () => {
		const user = userEvent.setup();
		await renderSpecs(<SpecChanges />);
		await user.click(await screen.findByRole("button", { name: /^add-billing/ }));
		await user.click(await screen.findByRole("button", { name: "Archive" }));
		expect(await screen.findByRole("button", { name: /^add-auth/ })).toBeVisible();
		expect(screen.queryByRole("button", { name: /^add-billing/ })).toBeNull();
		expect(mockState().specs.files["docs/openspec/specs/invoices/spec.md"]).toBeDefined();
	});

	it("lists the open items and archives only after the person confirms", async () => {
		const user = userEvent.setup();
		await withTracker();
		await renderSpecs(<SpecChanges />);
		let review = await startSplit(user);
		await user.click(await review.findByRole("button", { name: "Preview" }));
		await user.click(
			await within(await screen.findByRole("dialog")).findByRole("button", { name: "Apply" }),
		);
		await within(await screen.findByRole("dialog")).findByRole("heading", { name: "Written (3)" });
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(screen.getByRole("button", { name: "Archive" }));
		const dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findAllByRole("listitem")).toHaveLength(3);
		expect(mockState().specs.files["docs/openspec/changes/add-auth/proposal.md"]).toBeDefined();
		await user.click(dialog.getByRole("button", { name: "Confirm" }));
		await waitFor(() =>
			expect(mockState().specs.files["docs/openspec/changes/add-auth/proposal.md"]).toBeUndefined(),
		);
		review = within(document.body);
		expect(await screen.findByRole("button", { name: /^add-billing/ })).toBeVisible();
	});
});
