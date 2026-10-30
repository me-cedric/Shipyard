import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
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
});
