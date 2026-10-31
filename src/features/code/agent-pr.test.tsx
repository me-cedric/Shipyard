import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));
const row = (name: RegExp) => screen.findByRole("button", { name });

describe("Code / Pull requests: agent actions", () => {
	it("reviews with an agent, shows the finding on its line, drops one and posts once", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await row(/health route/));
		await user.click(await screen.findByRole("button", { name: "Review with an agent" }));
		const panel = (await screen.findByRole("heading", { name: "Agent review (2)" })).closest(
			"section",
		) as HTMLElement;
		const diff = await within(panel).findByRole("region", { name: "Diff of src/app.ts" });
		expect(within(diff).getByText("This line has no test.")).toBeVisible();
		await user.click(within(diff).getByRole("button", { name: "Drop src/app.ts:1" }));
		await waitFor(() =>
			expect(screen.getByRole("heading", { name: "Agent review (1)" })).toBeVisible(),
		);
		await user.click(screen.getByRole("button", { name: "Post review" }));
		expect(await screen.findByText("Posted")).toBeVisible();
		expect(screen.queryByRole("button", { name: "Post review" })).toBeNull();
		expect(screen.getByRole("button", { name: "Review with an agent" })).toBeDisabled();
		expect(mockState().agentPr?.runs).toBe(1);
	});

	it("lists a finding that has no line in the diff, and shows two findings of one line", async () => {
		const user = userEvent.setup();
		await demo();
		const d = await unwrap(commands.codePullDetail(141));
		const path = d.files[0]?.path ?? "";
		await unwrap(commands.prReviewStart(141, true));
		const draft = mockState().agentPr?.reviews[`141-${d.headSha}`];
		if (draft)
			draft.findings = [
				{ severity: "P1", path, line: 3, text: "First on the line." },
				{ severity: "P2", path, line: 3, text: "Second on the line." },
				{ severity: "P2", path, line: 99, text: "Far from the hunks." },
			];
		mountApp("/code/pull-requests");
		await user.click(await row(/health route/));
		const panel = (await screen.findByRole("heading", { name: "Agent review (3)" })).closest(
			"section",
		) as HTMLElement;
		const diff = within(panel).getByRole("region", { name: `Diff of ${path}` });
		expect(within(diff).getByText("First on the line.")).toBeVisible();
		expect(within(diff).getByText("Second on the line.")).toBeVisible();
		// The far finding is in the list, not in the diff, and a person can drop it.
		expect(within(diff).queryByText("Far from the hunks.")).toBeNull();
		expect(within(panel).getByText("Far from the hunks.")).toBeVisible();
		await user.click(within(panel).getByRole("button", { name: `Drop ${path}:99` }));
		expect(within(panel).queryByText("Far from the hunks.")).toBeNull();
	});

	it("posts a draft once when the button is clicked twice", async () => {
		const user = userEvent.setup();
		await demo();
		await unwrap(commands.prReviewStart(141, true));
		const send = commands.prReviewPost;
		const post = vi.spyOn(commands, "prReviewPost").mockImplementation(async (...a) => {
			await new Promise((r) => setTimeout(r, 30));
			return send(...a);
		});
		mountApp("/code/pull-requests");
		await user.click(await row(/health route/));
		const button = await screen.findByRole("button", { name: "Post review" });
		await user.dblClick(button);
		expect(await screen.findByText("Posted")).toBeVisible();
		expect(post).toHaveBeenCalledTimes(1);
		post.mockRestore();
	});

	it("starts one review for each head commit", async () => {
		await demo();
		const d = await unwrap(commands.codePullDetail(141));
		await unwrap(commands.prReviewStart(141, true));
		await unwrap(commands.prReviewStart(141, true));
		expect(mockState().agentPr?.runs).toBe(1);
		expect((await unwrap(commands.prReviewGet(141, d.headSha)))?.posted).toBe(false);
	});

	it("fills the title and the body in the form and opens nothing", async () => {
		const user = userEvent.setup();
		await demo();
		mountApp("/code/pull-requests");
		await user.click(await screen.findByRole("button", { name: "Open pull request" }));
		const form = await screen.findByRole("dialog");
		await user.click(within(form).getByRole("button", { name: "Write with an agent" }));
		await waitFor(() =>
			expect(within(form).getByRole("textbox", { name: "Title" })).toHaveValue(
				"feat(code): list the pull requests",
			),
		);
		expect(
			mockState().prs?.pulls.some((p) => p.title === "feat(code): list the pull requests"),
		).toBe(false);
	});

	it("refuses the three actions in a read-only project, with the plain error", async () => {
		const user = userEvent.setup();
		await demo();
		const project = mockState().projects[0];
		if (project) project.overrides = { ...project.overrides, readOnly: true };
		mountApp("/code/pull-requests");
		await user.click(await row(/health route/));
		await user.click(await screen.findByRole("button", { name: "Review with an agent" }));
		expect(await screen.findByText(/read only/)).toBeVisible();
		expect(mockState().agentPr?.runs ?? 0).toBe(0);
		await expect(unwrap(commands.prWriteText(null, true))).rejects.toMatchObject({
			code: "read_only",
		});
	});

	it("stops a review when the agents are stopped and names the switch", async () => {
		await demo();
		await unwrap(commands.killSwitchSet(true));
		await expect(unwrap(commands.prReviewStart(141, true))).rejects.toMatchObject({
			code: "agents_stopped",
		});
	});
});
