import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { needsYouNotice } from "@/lib/home";
import { en } from "@/lib/i18n/en";
import { fr } from "@/lib/i18n/fr";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";

const run = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};

function Probe({ notice }: { notice: Parameters<ReturnType<typeof useNotifications>["push"]>[0] }) {
	const { push, items } = useNotifications();
	return (
		<>
			<button type="button" onClick={() => push(notice)}>
				push
			</button>
			<span data-testid="count">{items.length}</span>
		</>
	);
}

describe("Needs you notifications (shell REQ-008)", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("makes an entry for an open question, an approval and a run in Needs you", async () => {
		const waiting = await run("ACME-1");
		const q = await needsYouNotice("factory-question", { run: waiting.id, id: "Q-101" }, en);
		expect(q).toMatchObject({
			id: `question:${waiting.id}:Q-101`,
			kind: "needs-you",
			title: "ACME-1: question",
		});
		const approval = (await unwrap(commands.approvalsList()))[0];
		if (!approval) throw new Error("no approval");
		const a = await needsYouNotice(
			"factory-approval",
			{ run: approval.run, id: String(approval.id) },
			fr,
		);
		expect(a).toMatchObject({
			id: `approval:${approval.id}`,
			kind: "needs-you",
			body: approval.summary,
		});
		expect(a?.title).toContain("approbation");
		const r = await needsYouNotice("factory-run", { run: waiting.id, id: "" }, en);
		expect(r).toMatchObject({
			id: `run:${waiting.id}:WaitingForAnswer`,
			title: "ACME-1: needs you",
		});
	});

	it("makes no entry for an answered question, a working run or a message", async () => {
		const paused = await run("ACME-6");
		expect(
			await needsYouNotice("factory-question", { run: paused.id, id: "Q-099" }, en),
		).toBeNull();
		const working = await run("ACME-2");
		expect(await needsYouNotice("factory-run", { run: working.id, id: "" }, en)).toBeNull();
		expect(await needsYouNotice("factory-message", { run: working.id, id: "0" }, en)).toBeNull();
	});

	it("shows one entry and one system notice for the same id", async () => {
		const spy = vi.spyOn(document, "hasFocus").mockReturnValue(false);
		const waiting = await run("ACME-1");
		const n = await needsYouNotice("factory-question", { run: waiting.id, id: "Q-101" }, en);
		if (!n) throw new Error("no notice");
		render(
			<NotificationsProvider>
				<Probe notice={n} />
			</NotificationsProvider>,
		);
		await act(async () => {
			await userEvent.click(screen.getByRole("button", { name: "push" }));
			await userEvent.click(screen.getByRole("button", { name: "push" }));
		});
		expect(screen.getByTestId("count")).toHaveTextContent("1");
		expect(mockState().os).toHaveLength(1);
		spy.mockRestore();
	});
});
