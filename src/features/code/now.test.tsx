import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

async function now() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const router = mountApp("/code/now");
	const files = await screen.findByRole("region", { name: "5 files to commit" });
	return { router, files };
}

// spec:app-redesign#REQ-022, scenario Now.
describe("Code / Now", () => {
	it("shows the changed files with the commit box, and the open pull requests", async () => {
		const { router, files } = await now();
		for (const name of ["app.ts", "util.ts", "guide.md", "README.md"])
			expect(within(files).getAllByRole("button", { name }).length).toBeGreaterThan(0);
		const box = within(files).getByRole("form", { name: "Commit" });
		expect(within(box).getByRole("textbox", { name: "Summary" })).toBeInTheDocument();
		expect(within(box).getByRole("button", { name: "Write it for me" })).toBeEnabled();
		expect(within(box).getByRole("button", { name: "Commit" })).toBeEnabled();
		const open = (await unwrap(commands.pullsList())).filter((r) => r.state === "open");
		expect(open.length).toBeGreaterThan(0);
		const pulls = screen.getByRole("region", { name: "Pull requests" });
		expect(
			await within(pulls).findByRole("heading", { name: `Open (${open.length})` }),
		).toBeInTheDocument();
		for (const r of open)
			expect(
				within(pulls).getByRole("link", { name: (n) => n.startsWith(`#${r.number}${r.title}`) }),
			).toBeVisible();
		await idle(router);
	});

	it("commits the staged files from the commit box and empties it", async () => {
		const user = userEvent.setup();
		const { router, files } = await now();
		const box = within(files).getByRole("form", { name: "Commit" });
		await user.type(within(box).getByRole("textbox", { name: "Summary" }), "nonsense");
		await user.click(within(box).getByRole("button", { name: "Commit" }));
		// A refused commit keeps the text and shows the reason.
		expect(await within(box).findByRole("alert")).toBeInTheDocument();
		const summary = within(box).getByRole("textbox", { name: "Summary" });
		await user.clear(summary);
		await user.type(summary, "feat(app): add the page");
		await user.click(within(box).getByRole("button", { name: "Commit" }));
		expect(await screen.findByRole("region", { name: "4 files to commit" })).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue("");
		expect(screen.getByRole("heading", { name: "Staged (0)" })).toBeInTheDocument();
		await idle(router);
	});

	it("leaves the staged files in the draft of the assistant for Write it for me", async () => {
		const user = userEvent.setup();
		const { router, files } = await now();
		await user.click(within(files).getByRole("button", { name: "Write it for me" }));
		expect(await screen.findByDisplayValue(/Conventional Commits.*src\//)).toBeInTheDocument();
		await idle(router);
	});

	it("offers Merge on a pull request whose checks pass, as a link to its page", async () => {
		await unwrap(commands.projectsOpen("/mock/demo", false));
		const router = mountApp("/code/now");
		const rows = (await unwrap(commands.pullsList())).filter(
			(r) => r.state === "open" && !r.draft && r.ci === "passing" && r.review === "clear",
		);
		expect(rows.length).toBeGreaterThan(0);
		const merges = await screen.findAllByRole("link", { name: /^Merge pull request \d+$/ });
		expect(merges).toHaveLength(rows.length);
		expect(merges[0]).toHaveAttribute("href", expect.stringMatching(/^\/code\/pull-requests\//));
		await idle(router);
	});

	it("opens the product health and the files of the project from their doors", async () => {
		const user = userEvent.setup();
		const { router } = await now();
		expect(screen.getByRole("link", { name: "Product health" })).toHaveAttribute(
			"href",
			"/flow/health",
		);
		await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Files" }));
		expect(await screen.findByRole("complementary", { name: "Files" })).toBeInTheDocument();
		await idle(router);
	});
});
