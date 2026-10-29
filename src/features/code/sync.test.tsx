import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

const bar = async () => within(await screen.findByRole("contentinfo"));
// The one Sync action sits in the context bar on top.
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
	it("shows the count, the branch, the author and the subject beside Sync", async () => {
		await withNotice();
		mountApp("/code/changes");
		expect(await (await bar()).findByRole("status")).toHaveTextContent(
			"2 new on origin/main, Ada: feat: x",
		);
	});

	it("keeps a dirty working copy, names the files and keeps the notice", async () => {
		const user = userEvent.setup();
		await withNotice();
		mountApp("/code/changes");
		await (await bar()).findByRole("status");
		await user.click((await top()).getByRole("button", { name: "Sync" }));
		expect(await (await bar()).findByRole("alert")).toHaveTextContent("src/app.ts");
		expect((await bar()).getByRole("status")).toBeInTheDocument();
	});

	it("brings a clean working copy up to date and the notice leaves", async () => {
		const user = userEvent.setup();
		await withNotice();
		await unwrap(commands.codeDiscard(["src", "docs"], false));
		await unwrap(commands.codeDiscard(["README.md"], true));
		await unwrap(commands.codeUnstage(["src"]));
		await unwrap(commands.codeDiscard(["src"], false));
		mountApp("/code/changes");
		await (await bar()).findByRole("status");
		await user.click((await top()).getByRole("button", { name: "Sync" }));
		const footer = await bar();
		await waitFor(() => expect(footer.queryByRole("status")).toBeNull());
		expect(footer.queryByRole("alert")).toBeNull();
	});
});
