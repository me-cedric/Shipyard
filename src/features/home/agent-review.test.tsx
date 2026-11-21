import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

const demo = () => unwrap(commands.projectsOpen("/mock/demo", false));

describe("Home / Needs you: agent review", () => {
	it("shows a draft review that waits, opens its pull request, and drops it once posted", async () => {
		const user = userEvent.setup();
		await demo();
		const draft = await unwrap(commands.prReviewStart(141, true));
		const router = mountApp("/home/today");
		const queue = within(await screen.findByRole("list", { name: "Needs you" }));
		// The queue shows three things: "N more" shows the rest in place.
		await user.click(await queue.findByRole("button", { name: /^\d+ more$/ }));
		await user.click(
			await queue.findByRole("button", {
				name: (n) => n.endsWith(`Review the pull request ${draft.title}`),
			}),
		);
		const group = within((await screen.findAllByRole("article"))[0] as HTMLElement);
		expect(group.getAllByText(draft.title)[0]).toBeVisible();
		await user.click(group.getByRole("button", { name: "Open the pull request" }));
		// The pull request page opens at the address of that pull request, with the draft on it.
		await waitFor(() =>
			expect(router.state.location.pathname).toBe("/code/pull-requests/github-demo-141"),
		);
		// The agent review is in Chat.
		await user.click(
			within(await screen.findByRole("navigation", { name: "Sections" })).getByRole("button", {
				name: "Chat",
			}),
		);
		expect(await screen.findByRole("heading", { name: /Agent review \(2\)/ })).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Post review" }));
		expect(await screen.findByText("Posted")).toBeVisible();
		// The demo keeps one other draft waiting (the review comment of Code / local changes).
		await waitFor(async () =>
			expect((await unwrap(commands.prReviewWaiting())).filter((w) => w.number === 141)).toEqual(
				[],
			),
		);
	});

	it("shows no review when no draft waits", async () => {
		await demo();
		mountApp("/home/today");
		await screen.findByRole("heading", { level: 1, name: /Today|need you/ });
		expect(screen.queryByRole("button", { name: "Open the pull request" })).toBeNull();
	});
});
