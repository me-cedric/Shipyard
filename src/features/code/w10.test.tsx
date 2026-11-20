import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));
const draft = (text: RegExp) => screen.findByDisplayValue(text);
// The write box, the agent review and the assistant actions are in Chat.
const toChat = async (user: ReturnType<typeof userEvent.setup>) =>
	user.click(
		within(await screen.findByRole("navigation", { name: "Sections" })).getByRole("button", {
			name: "Chat",
		}),
	);

describe("Code, W10", () => {
	it("fills the draft of the assistant with the pull request", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/now");
		await user.click(await screen.findByRole("link", { name: /health route/ }));
		await toChat(user);
		await user.click(await screen.findByRole("button", { name: "Write description" }));
		expect(await draft(/Write the description of pull request #\d+ .*health route/)).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Review" }));
		expect(await draft(/Review pull request #\d+/)).toBeVisible();
	});

	it("warns before a commit when a spec is staged and its test plan is not", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.codeStatus());
		const files = mockState().code?.files;
		if (!files) throw new Error("no code state");
		files["docs/openspec/x/spec.md"] = { head: null, index: "s\n", work: "s\n" };
		mountApp("/code/now");
		expect(
			await screen.findByText("Specs changed, Test plans did not: docs/openspec/x/spec.md"),
		).toBeInTheDocument();
	}, 20_000);

	it("acknowledges the warning of the commit gate with a reason, as in the branch watch", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.codeStatus());
		const files = mockState().code?.files;
		if (!files) throw new Error("no code state");
		files["docs/openspec/x/spec.md"] = { head: null, index: "s\n", work: "s\n" };
		mountApp("/code/now");
		const text = "Specs changed, Test plans did not: docs/openspec/x/spec.md";
		await user.click(await screen.findByRole("button", { name: "Acknowledge Test plans" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.type(dialog.getByRole("textbox", { name: "Reason" }), "No test impact");
		await user.click(dialog.getByRole("button", { name: "Acknowledge" }));
		await waitFor(() => expect(screen.queryByText(text)).toBeNull());
		expect(mockState().review?.acks).toHaveLength(1);
	}, 20_000);

	it("names the push target when the account cannot push", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.codeStatus());
		mountApp("/code/branches");
		// The page has no line about it: the line shows with the confirmation of a force publish, behind More.
		const user = userEvent.setup();
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Force publish" }));
		expect(await screen.findByText(/is the default branch of origin/)).toBeInTheDocument();
	});

	it("hands the conflicted files to the assistant", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.codeStatus());
		const code = mockState().code;
		if (!code) throw new Error("no code state");
		await unwrap(commands.codeUnstage(["src"]));
		await unwrap(commands.codeDiscard(["src", "docs"], false));
		const side = code.branches["feat/auth/login"];
		side?.log.unshift("s".repeat(40));
		side?.touches.push("src/app.ts");
		code.branches.main?.touches.push("src/app.ts");
		await unwrap(commands.codeBranchMerge("feat/auth/login"));
		mountApp("/code/changes");
		await user.click(await screen.findByRole("button", { name: "Solve with an agent" }));
		expect(await draft(/Resolve the merge conflicts in src\/app\.ts/)).toBeVisible();
	}, 20_000);

	it("lists the delivery notes of docs/delivery/impacts", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		mountApp("/code/impacts");
		expect(
			await screen.findByRole("button", { name: "Open Sync impact · 2026-10-20" }),
		).toBeInTheDocument();
	});
});
