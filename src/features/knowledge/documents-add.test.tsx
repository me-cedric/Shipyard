import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { mockState } from "@/lib/ipc/mock";
import { mountKnowledge } from "./harness";

const add = en.library.fn.documents.addFile;

// spec:library-functions#REQ-003
describe("Add a file to Documents", () => {
	it("copies a Word file into the documents folder and keeps it as Word", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await screen.findByRole("button", { name: /^Client brief/ });
		mockState().nextFile = "/Users/ada/plan.docx";
		await user.click(screen.getByRole("button", { name: add }));
		await waitFor(() => expect(mockState().review?.docx["docs/documents/plan.docx"]).toBeDefined());
		const card = await screen.findByRole("button", { name: /^plan\s*Word$/ });
		expect(card).toBeVisible();
		expect(await screen.findByRole("heading", { level: 2, name: "plan" })).toBeVisible();
	});

	it("lists any other file with its extension, and gives a taken name a number", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await screen.findByRole("button", { name: /^Client brief/ });
		for (const path of ["/Users/ada/brief.pdf", "/Users/ada/brief.pdf"]) {
			mockState().nextFile = path;
			await user.click(screen.getByRole("button", { name: add }));
		}
		expect(await screen.findByRole("button", { name: /^brief\.pdf\s*PDF$/ })).toBeVisible();
		expect(await screen.findByRole("button", { name: /^brief-2\.pdf\s*PDF$/ })).toBeVisible();
		const card = await screen.findByRole("region", { name: "brief-2.pdf" });
		expect(within(card).getByRole("button", { name: "Open" })).toBeVisible();
	});

	it("adds nothing when the person cancels the picker", async () => {
		const user = userEvent.setup();
		await mountKnowledge("documents");
		await screen.findByRole("button", { name: /^Client brief/ });
		mockState().nextFile = "";
		await user.click(screen.getByRole("button", { name: add }));
		await waitFor(() => expect(mockState().nextFile).toBeUndefined());
		expect(mockState().knowledge.others).toEqual([]);
	});
});
