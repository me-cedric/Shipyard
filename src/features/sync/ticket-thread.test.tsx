import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { importAll, withTracker } from "@/test/tracker";
import { TicketThread } from "./ticket-thread";

const mount = () =>
	render(
		<Providers>
			<TicketThread itemKey="ACME-1" />
		</Providers>,
	);

describe("the ticket thread", () => {
	it("reads the comments, posts one, edits the title and adds a label", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mount();
		const list = await screen.findByRole("list", { name: "Comments" });
		expect(await within(list).findByText("Seen on staging.")).toBeInTheDocument();

		await user.type(screen.getByRole("textbox", { name: "Comment" }), "Fixed in 1.2");
		await user.click(screen.getByRole("button", { name: "Post comment" }));
		expect(await within(list).findByText("Fixed in 1.2")).toBeInTheDocument();
		expect(mockState().work.comments["ACME-1"]).toHaveLength(2);

		const summary = screen.getByRole("textbox", { name: "Summary" });
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await user.clear(summary);
		await user.type(summary, "Fix the login redirect");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().sync.mirror.find((m) => m.key === "ACME-1")?.title).toBe(
				"Fix the login redirect",
			),
		);

		await user.type(screen.getByRole("textbox", { name: "New label" }), "two words");
		await user.click(screen.getByRole("button", { name: "Add label" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("a label is one word");
		await user.clear(screen.getByRole("textbox", { name: "New label" }));
		await user.type(screen.getByRole("textbox", { name: "New label" }), "urgent");
		await user.click(screen.getByRole("button", { name: "Add label" }));
		expect(await screen.findByText("urgent")).toBeInTheDocument();
	}, 20_000);

	it("removes a label, sets a priority and sends a description, each with one click", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mount();
		await user.type(await screen.findByRole("textbox", { name: "New label" }), "urgent");
		await user.click(screen.getByRole("button", { name: "Add label" }));
		await user.click(await screen.findByRole("button", { name: "Remove urgent" }));
		await waitFor(() =>
			expect(mockState().sync.mirror.find((m) => m.key === "ACME-1")?.labels).not.toContain(
				"urgent",
			),
		);
		const save = screen.getByRole("button", { name: "Save description" });
		expect(save).toBeDisabled();
		await user.type(screen.getByRole("textbox", { name: "Description" }), "Steps to reproduce");
		// The field opens with the text of the tracker, so the edit adds to it.
		expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
			"Fix login redirect.Steps to reproduce",
		);
		await user.click(save);
		// After the save the edit is over: Save is off again.
		await waitFor(() => expect(save).toBeDisabled());
		expect(screen.getByRole("combobox", { name: "Priority" })).toBeInTheDocument();
	}, 20_000);

	it("shows no control for a flag that the tracker leaves off", async () => {
		await withTracker();
		await importAll();
		const spy = vi.spyOn(commands, "workTicketEditCaps").mockResolvedValue({
			status: "ok",
			data: {
				title: true,
				description: false,
				labels: false,
				removeLabel: false,
				assignee: true,
				status: true,
				priority: false,
			},
		});
		mount();
		await screen.findByRole("textbox", { name: "Summary" });
		expect(screen.queryByRole("textbox", { name: "Description" })).toBeNull();
		expect(screen.queryByRole("textbox", { name: "New label" })).toBeNull();
		expect(screen.queryByRole("combobox", { name: "Priority" })).toBeNull();
		spy.mockRestore();
	});
});
