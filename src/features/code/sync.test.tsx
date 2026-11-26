import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openSync } from "@/features/shell/test-open";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

// The top row holds the one live region of the notice and of the failure. The card shows the same words.
const top = async () => within(await screen.findByRole("banner"));

async function withNotice() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const code = seedCode();
	code.notice = {
		project: "alpha",
		changes: [
			{
				name: "origin/main",
				old: null,
				new: "b".repeat(40),
				count: 2,
				author: "Ada",
				subject: "feat: x",
			},
		],
	};
	mockState().code = code;
}

describe("the remote watch notice and the sync action", () => {
	it("shows the count, the branch, the author and the subject in the top row and in the card", async () => {
		const user = userEvent.setup();
		await withNotice();
		mountApp("/code/now");
		expect(await (await top()).findByRole("status")).toHaveTextContent(
			"2 new on origin/main, Ada: feat: x",
		);
		const card = await openSync(user);
		expect(card.getByText("2 new on origin/main, Ada: feat: x")).toBeVisible();
		// One live region: it stays in the top row, and the card has none.
		expect(card.queryByRole("status")).toBeNull();
		expect((await top()).getAllByRole("status")).toHaveLength(1);
	});

	it("keeps a dirty working copy, says so in plain words and keeps the notice", async () => {
		const user = userEvent.setup();
		await withNotice();
		mountApp("/code/now");
		await (await top()).findByRole("status");
		const card = await openSync(user);
		await user.click(card.getByRole("button", { name: "Sync" }));
		const alert = await (await top()).findByRole("alert");
		expect(alert).toHaveTextContent("not saved in a commit");
		expect(alert).toHaveTextContent("src/app.ts");
		expect(card.getByText(/src\/app\.ts/)).toBeVisible();
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(card.getByText("2 new on origin/main, Ada: feat: x")).toBeVisible();
	});

	it("brings a clean working copy up to date and the notice leaves", async () => {
		const user = userEvent.setup();
		await withNotice();
		await unwrap(commands.codeDiscard(["src", "docs"], false));
		await unwrap(commands.codeDiscard(["README.md"], true));
		await unwrap(commands.codeUnstage(["src"]));
		await unwrap(commands.codeDiscard(["src"], false));
		mountApp("/code/now");
		await (await top()).findByRole("status");
		const card = await openSync(user);
		await user.click(card.getByRole("button", { name: "Sync" }));
		const row = await top();
		await waitFor(() => expect(row.queryByRole("status")).toBeNull());
		expect(card.queryByRole("status")).toBeNull();
		expect(card.queryByText(/new on origin\/main/)).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
