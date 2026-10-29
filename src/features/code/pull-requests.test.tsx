import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));
const row = (name: RegExp) => screen.findByRole("button", { name });

describe("Code / Pull requests", () => {
	it("lists the mirror by state with counts", async () => {
		await demo();
		mountApp("/code/pull-requests");
		await row(/health route/);
		expect(screen.getByRole("heading", { name: "Open (8)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Merged (1)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Closed (1)" })).toBeInTheDocument();
		expect(screen.getAllByRole("img", { name: "CI failing" }).length).toBeGreaterThan(0);
	});

	it("shows an empty state with Connect when the project has no forge mirror", async () => {
		// The factory mock gives its pull requests to the first project that asks.
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await unwrap(commands.pullsList());
		await unwrap(commands.projectsOpen("/mock/beta", false));
		mountApp("/code/pull-requests");
		expect(await screen.findByRole("button", { name: "Connect" })).toBeInTheDocument();
	});

	it("opens a pull request with its files, commits, checks, conversation, verdicts and links", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await row(/refuse an empty token/));
		expect(await screen.findByRole("heading", { name: "Checks (3)" })).toBeInTheDocument();
		expect(screen.getAllByRole("img", { name: "Failing" })).toHaveLength(2);
		expect(screen.getByText("unit")).toBeInTheDocument();
		expect(screen.getByText("lint")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Files (1)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Commits (1)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Conversation (1)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Verdicts (1)" })).toBeInTheDocument();
		expect(screen.getByText("Grace Hopper: rename this")).toBeInTheDocument();
		expect(screen.getByText(/wi:SHIP-42/)).toBeInTheDocument();
		expect(await screen.findByRole("region", { name: "Diff of src/app.ts" })).toBeInTheDocument();
	});

	it("keeps Merge off for a draft, marks it ready, then merges after a confirmation that names the method", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await row(/show the pull requests/));
		const merge = await screen.findByRole("button", { name: "Merge" });
		expect(merge).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Mark ready" }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Merge" })).toBeEnabled());
		expect(screen.queryByRole("button", { name: "Mark ready" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Merge" }));
		await user.click(await screen.findByRole("button", { name: "Merge with Merge" }));
		expect(await screen.findByRole("heading", { name: "Merged (2)" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Open (7)" })).toBeInTheDocument();
	});

	it("posts a comment and refuses a request for changes with no text", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await row(/health route/));
		await user.click(await screen.findByRole("button", { name: "Request changes" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("some text");
		await user.type(screen.getByRole("textbox", { name: "Comment" }), "rename it");
		await user.click(screen.getByRole("button", { name: "Comment" }));
		expect(await screen.findByText("Ada Lovelace: rename it")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Conversation (1)" })).toBeInTheDocument();
	});

	it("opens a pull request from the form and shows the forge refusal", async () => {
		const user = userEvent.setup();
		await demo();
		const code = seedCode();
		code.branch = "feat/demo/login";
		code.remoteBranches.push("origin/feat/demo/login");
		mockState().code = code;
		mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: "Open pull request" }));
		const form = await screen.findByRole("dialog");
		const submit = () =>
			user.click(within(form).getByRole("button", { name: "Open pull request" }));
		await submit();
		expect(await within(form).findByRole("alert")).toHaveTextContent("needs a title");
		await user.type(within(form).getByRole("textbox", { name: "Title" }), "feat(code): login");
		await user.type(within(form).getByRole("textbox", { name: "Base" }), "feat/demo/login");
		await submit();
		expect(await within(form).findByRole("alert")).toHaveTextContent("its own branch");
		await user.clear(within(form).getByRole("textbox", { name: "Base" }));
		await submit();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(await screen.findByRole("heading", { name: "Open (9)" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /feat\(code\): login/ })).toBeInTheDocument();
	});
});
