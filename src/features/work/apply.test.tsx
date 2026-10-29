import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";
import { renderApp } from "@/ui/test-utils";
import { CreateWorkItem } from "./apply";

const openApply = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(await screen.findByRole("button", { name: "Apply" }));
	return within(await screen.findByRole("dialog"));
};
const written = () => Object.keys(mockState().work.written);

describe("the apply preview and apply", () => {
	it("shows the rows to create and writes nothing before the person applies", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/plan");
		const dialog = await openApply(user);
		expect(await dialog.findByRole("heading", { name: "Create (8)" })).toBeInTheDocument();
		// 2 features (epics) and 6 tasks (stories).
		expect(dialog.getAllByText("Epic")).toHaveLength(2);
		expect(dialog.getAllByText("Story")).toHaveLength(6);
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(written()).toHaveLength(0);
	});

	it("writes each row, shows each result, and a second apply creates no duplicate", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/plan");
		let dialog = await openApply(user);
		await user.click(await dialog.findByRole("button", { name: "Apply" }));
		expect(await dialog.findByRole("heading", { name: "Written (8)" })).toBeInTheDocument();
		expect(written()).toHaveLength(8);
		// The apply button gives way to the close button.
		expect(dialog.queryByRole("button", { name: "Apply" })).toBeNull();
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		dialog = await openApply(user);
		expect(await dialog.findByRole("heading", { name: "Unchanged (8)" })).toBeInTheDocument();
		expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
		expect(written()).toHaveLength(8);
	});

	it("keeps the rows that were written when one row fails, and shows the failed row", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.failRows = ["est:mvp-1#auth-api"];
		mountApp("/work/plan");
		const dialog = await openApply(user);
		await user.click(await dialog.findByRole("button", { name: "Apply" }));
		expect(await dialog.findByRole("heading", { name: "Failed (1)" })).toBeInTheDocument();
		expect(dialog.getByText(/the tracker refused the change/)).toBeInTheDocument();
		expect(written()).toContain("est:mvp-1#auth");
		expect(written()).toContain("est:mvp-1#auth-design");
		expect(written()).not.toContain("est:mvp-1#auth-api");
		expect(dialog.getByRole("heading", { name: "Written (7)" })).toBeInTheDocument();
	});

	it("reads the effort of the sheet again: a changed task shows as an update", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/plan");
		let dialog = await openApply(user);
		await user.click(await dialog.findByRole("button", { name: "Apply" }));
		await dialog.findByRole("heading", { name: "Written (8)" });
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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
		dialog = await openApply(user);
		// The task and the test task, which is a share of the build effort.
		expect(await dialog.findByRole("heading", { name: "Update (2)" })).toBeInTheDocument();
		expect(dialog.getAllByText("Estimate")).toHaveLength(2);
		expect(dialog.getByRole("heading", { name: "Unchanged (6)" })).toBeInTheDocument();
	});
});

describe("Create work item", () => {
	it("creates one item from a ref after one click, and a second click creates none", async () => {
		const user = userEvent.setup();
		await withTracker();
		renderApp(<CreateWorkItem refId="diagram:context" title="Context diagram" />);
		await user.click(await screen.findByRole("button", { name: "Create work item" }));
		let dialog = within(await screen.findByRole("dialog"));
		expect(await dialog.findByRole("heading", { name: "Create (1)" })).toBeInTheDocument();
		// The preview alone writes nothing.
		expect(written()).toHaveLength(0);
		await user.click(dialog.getByRole("button", { name: "Apply" }));
		expect(await dialog.findByRole("heading", { name: "Written (1)" })).toBeInTheDocument();
		expect(mockState().work.written["diagram:context"]?.row.title).toBe("Context diagram");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await user.click(screen.getByRole("button", { name: "Create work item" }));
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
