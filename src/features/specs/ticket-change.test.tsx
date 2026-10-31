import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

describe("Specs / Changes: from a ticket", () => {
	it("makes a change on a specs branch with the ticket text, then delegates it to an agent", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/specs/changes");
		await user.click(await screen.findByRole("button", { name: "From a ticket" }));
		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("combobox", { name: "Ticket" }));
		await user.click(await screen.findByRole("option", { name: "ACME-2 Add export endpoint" }));
		await user.click(within(dialog).getByRole("button", { name: "Create" }));
		expect(await within(dialog).findByText("Branch specs/add-export-endpoint")).toBeVisible();
		const proposal =
			mockState().specs.files["docs/openspec/changes/add-export-endpoint/proposal.md"];
		expect(proposal?.text).toContain("# Add export endpoint");
		expect(proposal?.text).toContain("wi:ACME-2");
		await user.click(within(dialog).getByRole("button", { name: "Delegate to an agent" }));
		expect(await within(dialog).findByText(/^Sent as wf:/)).toBeVisible();
	});

	it("refuses a ticket that is not in the mirror and a read-only project", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const project = mockState().projects[0];
		if (project) project.overrides = { ...project.overrides, readOnly: true };
		mountApp("/specs/changes");
		await user.click(await screen.findByRole("button", { name: "From a ticket" }));
		const dialog = await screen.findByRole("dialog");
		await user.click(within(dialog).getByRole("combobox", { name: "Ticket" }));
		await user.click(await screen.findByRole("option", { name: "ACME-2 Add export endpoint" }));
		await user.click(within(dialog).getByRole("button", { name: "Create" }));
		expect(await within(dialog).findByRole("alert")).toBeVisible();
		expect(
			mockState().specs.files["docs/openspec/changes/add-export-endpoint/proposal.md"],
		).toBeUndefined();
	});
});
