import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/lib/i18n/en";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import {
	checkNotices,
	fresh,
	markClicked,
	type NoticeInput,
	NotificationsProvider,
	reviewDraftNotice,
	runEndedNotice,
	scanNotices,
	useNotifications,
} from "@/lib/notifications";

const runIn = async (state: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.state === state);
	if (!r) throw new Error(state);
	return r;
};

function Push({ notice }: { notice: NoticeInput }) {
	const { push, items } = useNotifications();
	return (
		<>
			<button type="button" onClick={() => void push(notice)}>
				push
			</button>
			<span data-testid="count">{items.length}</span>
		</>
	);
}

describe("More notification sources (shell REQ-008)", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/demo", false));
	});

	it("makes an entry for a run that ends, with the run as target", async () => {
		const done = await runIn("Done");
		expect(await runEndedNotice(done.id, en, false)).toMatchObject({
			id: `run-ended:${done.id}:Done`,
			kind: "info",
			title: `${done.key}: run done`,
			target: { ref: done.reference },
		});
		const failed = await runIn("Failed");
		expect(await runEndedNotice(failed.id, en, false)).toMatchObject({
			kind: "needs-you",
			target: { ref: failed.reference },
		});
		// The "needs you" entry of the same failure was added: it shows once.
		expect(await runEndedNotice(failed.id, en, true)).toBeNull();
		const working = (await unwrap(commands.runsList())).find((x) => x.lane === "working");
		if (!working) throw new Error("no working run");
		expect(await runEndedNotice(working.id, en, false)).toBeNull();
	});

	it("makes one entry for each head commit and result of the checks, and none on the first read", async () => {
		const rows = await unwrap(commands.codeMyChecks());
		const found = checkNotices(rows, en);
		const failing = found.find((n) => n.id.startsWith("pr-checks:pr:github-demo:142:"));
		expect(failing).toMatchObject({
			kind: "needs-you",
			title: "#142: checks failed",
			target: { ref: "pr:github-demo:142" },
		});
		expect(found.find((n) => n.title === "#141: checks passed")?.kind).toBe("info");
		const seen = new Set<string>();
		expect(fresh(found, seen, true)).toEqual([]);
		expect(fresh(found, seen, false)).toEqual([]);
		const next = checkNotices(
			[{ ...(rows[0] as (typeof rows)[number]), headSha: "new", ci: "failing" }],
			en,
		);
		expect(fresh(next, seen, false)).toHaveLength(1);
		expect(fresh(next, seen, false)).toHaveLength(0);
	});

	it("makes an entry for a failed scan that no click started", async () => {
		const report = await unwrap(commands.codeScanRun("secrets", true));
		const view = await unwrap(commands.codeQuality());
		const [n] = scanNotices(view, en);
		expect(n).toMatchObject({ kind: "error", target: { route: "/code/quality" } });
		expect(n?.id).toBe(`scan-failed:scanner:secrets:${report.at}`);
		markClicked(report);
		expect(scanNotices(view, en).filter((x) => x.id === n?.id)).toEqual([]);
	});

	it("makes an entry for an automatic review draft only", async () => {
		await unwrap(commands.prReviewStart(141, true));
		expect(await reviewDraftNotice("141", en)).toBeNull();
		for (const d of Object.values(mockState().agentPr?.reviews ?? {})) d.auto = true;
		expect(await reviewDraftNotice("141", en)).toMatchObject({
			kind: "needs-you",
			title: "#141: review ready to post",
			target: { ref: "pr:github-demo:141" },
		});
		expect(await reviewDraftNotice("999", en)).toBeNull();
	});

	const sources: [string, NoticeInput, boolean][] = [
		["run-ended", { id: "run-ended:1:Failed", kind: "needs-you", title: "x" }, true],
		["run-ended", { id: "run-ended:2:Done", kind: "info", title: "x" }, false],
		["pr-checks", { id: "pr-checks:a:b:failing", kind: "needs-you", title: "x" }, true],
		["pr-checks", { id: "pr-checks:a:b:passing", kind: "info", title: "x" }, false],
		["scan-failed", { id: "scan-failed:a", kind: "error", title: "x" }, false],
		["review-draft", { id: "review-draft:1:a", kind: "needs-you", title: "x" }, true],
	];

	it.each(sources)(
		"%s: system notice only when it needs the person (%#)",
		async (_s, notice, os) => {
			vi.spyOn(document, "hasFocus").mockReturnValue(false);
			render(
				<NotificationsProvider>
					<Push notice={notice} />
				</NotificationsProvider>,
			);
			await act(
				async () => void (await userEvent.click(screen.getByRole("button", { name: "push" }))),
			);
			await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
			expect(mockState().os).toHaveLength(os ? 1 : 0);
		},
	);

	it.each(["run-ended", "pr-checks", "scan-failed", "review-draft"] as const)(
		"%s: a switch that is off stops the entry and the system notice",
		async (source) => {
			vi.spyOn(document, "hasFocus").mockReturnValue(false);
			mockState().prefs.notifyOff = [source];
			render(
				<NotificationsProvider>
					<Push notice={{ id: `${source}:1`, kind: "needs-you", title: "x" }} />
				</NotificationsProvider>,
			);
			await act(
				async () => void (await userEvent.click(screen.getByRole("button", { name: "push" }))),
			);
			await new Promise((r) => setTimeout(r, 50));
			expect(screen.getByTestId("count")).toHaveTextContent("0");
			expect(mockState().os).toHaveLength(0);
		},
	);
});
