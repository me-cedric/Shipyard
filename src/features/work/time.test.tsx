import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const group = async (name: string) => screen.findByRole("heading", { name });
const row = (text: string) => screen.getByText(text).closest("[role=row]") as HTMLElement;

describe("Work / Time", () => {
	it("lists the entries of the month by state", async () => {
		await withTracker();
		mountApp("/work/time");
		expect(await group("To send (2)")).toBeInTheDocument();
		expect(await group("In issue tracker (1)")).toBeInTheDocument();
		expect(row("Token API")).toHaveTextContent("4h");
		expect(row("Review of the login")).toHaveTextContent("3h");
	});

	it("adds an entry for a resolved member and writes one file of that member", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/time");
		await user.click(await screen.findByRole("button", { name: "Entry" }));
		await user.type(screen.getByRole("textbox", { name: "Duration" }), "2h");
		await user.type(screen.getByRole("textbox", { name: "Note" }), "Pairing");
		await user.click(screen.getAllByRole("button", { name: "Entry" }).at(-1) as HTMLElement);
		await waitFor(() => expect(mockState().work.time.ada).toHaveLength(4));
		expect(mockState().work.time.ada?.find((e) => e.note === "Pairing")).toMatchObject({
			day: "2026-11-02",
			minutes: 120,
		});
		expect(mockState().work.time.grace).toHaveLength(1);
		expect(await group("To send (3)")).toBeInTheDocument();
	});

	it("offers the full key and the title of a ticket, filtered by either, and picks one with the keys", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/time");
		await user.click(await screen.findByRole("button", { name: "Entry" }));
		const field = screen.getByRole("combobox", { name: "Ticket" });
		await user.click(field);
		const all = await screen.findAllByRole("option");
		expect(all.length).toBeGreaterThan(1);
		const first = all[0] as HTMLElement;
		const [key, title] = [
			first.children[0]?.textContent ?? "",
			first.children[1]?.textContent ?? "",
		];
		expect(key).toMatch(/^[A-Z]+-\d+$/);
		expect(first.children[1]).toHaveAttribute("title", title);
		// By title: only the tickets that hold the words stay.
		await user.clear(field);
		await user.type(field, title.slice(1, 6).toLowerCase());
		expect((await screen.findAllByRole("option")).some((o) => o.textContent?.includes(key))).toBe(
			true,
		);
		// By key, with the keyboard.
		await user.clear(field);
		await user.type(field, key);
		await user.keyboard("{Enter}");
		expect(field).toHaveValue(key);
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("saves an entry on a ticket and sends it at once, with the worklog id stored", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/time");
		await user.click(await screen.findByRole("button", { name: "Entry" }));
		await user.type(screen.getByRole("textbox", { name: "Duration" }), "1h");
		await user.type(screen.getByRole("combobox", { name: "Ticket" }), "ACME-1");
		await user.click(screen.getAllByRole("button", { name: "Entry" }).at(-1) as HTMLElement);
		await waitFor(() =>
			expect(
				mockState().work.time.ada?.find((e) => e.ticket === "ACME-1" && e.minutes === 60)?.worklog,
			).toBeDefined(),
		);
	});

	it("opens Work / Team with the Member button focused when the person is not in the team", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.me = null;
		const router = mountApp("/work/time");
		expect(await screen.findByRole("alert")).toHaveTextContent("You are not in the team yet.");
		await user.click(screen.getByRole("button", { name: "Open" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/work/team"));
		await waitFor(() => expect(screen.getByRole("button", { name: "Member" })).toHaveFocus());
	});

	it("offers one action when there is no team, and it adds the signed-in person", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.team = { members: [] };
		mockState().work.me = null;
		mountApp("/work/time");
		expect(await screen.findByText("No members")).toBeInTheDocument();
		// No raw error, and no other action in the page body.
		expect(screen.queryByRole("alert")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Add me to the team" }));
		await waitFor(() =>
			expect(mockState().work.team.members).toEqual([
				expect.objectContaining({ handle: "ada", name: "Ada Lovelace", trackers: ["ada"] }),
			]),
		);
		// The member is the default of the page.
		expect(await screen.findByRole("combobox", { name: "Member" })).toHaveTextContent(
			"Ada Lovelace",
		);
		expect(screen.queryByText("No members")).toBeNull();
	});

	it("says in plain words that no account is signed in, with the action to sign in", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.team = { members: [] };
		mockState().work.account = null;
		mountApp("/work/time");
		await user.click(await screen.findByRole("button", { name: "Add me to the team" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("No account is signed in.");
		expect(alert).not.toHaveTextContent("no signed-in account");
		expect(within(alert).getByRole("button", { name: "Open settings" })).toBeInTheDocument();
	});

	it("refuses the entry when it cannot resolve the member and names the reason", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.me = null;
		mountApp("/work/time");
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("You are not in the team yet.");
		expect(within(alert).getByRole("button", { name: "Open" })).toBeInTheDocument();
		// Naming the member fixes it.
		await user.click(screen.getByRole("combobox", { name: "Member" }));
		await user.click(await screen.findByRole("option", { name: "Grace Hopper" }));
		expect(await group("To send (1)")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("sends one worklog on a click and offers the entry no more", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/work/time");
		await group("To send (2)");
		expect(mockState().work.logs["ACME-1"]).toBeDefined();
		const before = mockState().work.logs["ACME-1"]?.length ?? 0;
		await user.click(screen.getByRole("button", { name: /^Send 2026-11-03 ACME-1$/ }));
		await waitFor(() => expect(mockState().work.logs["ACME-1"]).toHaveLength(before + 1));
		expect(mockState().work.time.ada?.find((e) => e.id === "t2")?.worklog).toBeDefined();
		expect(await group("In issue tracker (2)")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /^Send 2026-11-03 ACME-1$/ })).toBeNull();
	});

	it("disables Send while an entry goes to the tracker, so a second click sends nothing", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const real = commands.timeSend;
		let release = () => {};
		const gate = new Promise<void>((r) => {
			release = r;
		});
		const spy = vi.spyOn(commands, "timeSend").mockImplementation(async (...args) => {
			await gate;
			return real(...args);
		});
		mountApp("/work/time");
		await group("To send (2)");
		const send = () => screen.getByRole("button", { name: /^Send 2026-11-03 ACME-1$/ });
		await user.click(send());
		await waitFor(() => expect(send()).toBeDisabled());
		// The other Send buttons wait too: one send at a time.
		for (const b of screen.getAllByRole("button", { name: /^Send / })) expect(b).toBeDisabled();
		await user.click(send());
		expect(spy).toHaveBeenCalledTimes(1);
		release();
		expect(await group("In issue tracker (2)")).toBeInTheDocument();
		spy.mockRestore();
	});

	it("sends nothing for an entry with no ticket", async () => {
		await withTracker();
		mountApp("/work/time");
		await group("To send (2)");
		expect(row("Stand-up and planning").querySelector("button")).toBeDisabled();
	});

	it("never sends twice when the answer is lost: it finds the mark and stores the receipt", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mockState().work.loseNextAnswer = true;
		mountApp("/work/time");
		await group("To send (2)");
		const before = mockState().work.logs["ACME-1"]?.length ?? 0;
		await user.click(screen.getByRole("button", { name: /^Send 2026-11-03 ACME-1$/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent("the answer was lost");
		expect(mockState().work.logs["ACME-1"]).toHaveLength(before + 1);
		await user.click(screen.getByRole("button", { name: "Read the month" }));
		await user.click(await screen.findByRole("button", { name: /^Store receipt/ }));
		await waitFor(() =>
			expect(mockState().work.time.ada?.find((e) => e.id === "t2")?.worklog).toBeDefined(),
		);
		expect(mockState().work.logs["ACME-1"]).toHaveLength(before + 1);
	});

	it("flags a difference of duration and keeps both values, and shows a worklog only the tracker has", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const log = mockState().work.logs["ACME-2"]?.[0];
		if (log) log.minutes = 180;
		mountApp("/work/time");
		await group("In issue tracker (1)");
		await user.click(screen.getByRole("button", { name: "Read the month" }));
		const differs = await screen.findByRole("img", { name: "Durations differ" });
		const tokenRow = differs.closest("[role=row]") as HTMLElement;
		expect(tokenRow).toHaveTextContent("issue tracker 3h");
		expect(tokenRow).toHaveTextContent("4h");
		expect(mockState().work.time.ada?.find((e) => e.id === "t1")?.minutes).toBe(240);
		expect(await group("Only in issue tracker (1)")).toBeInTheDocument();
		const only = within(screen.getByRole("table", { name: "Time" }));
		expect(only.getAllByRole("row").some((r) => r.textContent?.includes("ACME-1"))).toBe(true);
	});

	it("edits the duration and the note of an entry", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/time");
		await user.click(await screen.findByRole("button", { name: /^Edit 2026-11-02 / }));
		const duration = screen.getByRole("textbox", { name: "Duration" });
		await user.clear(duration);
		await user.type(duration, "2h30");
		await user.type(screen.getByRole("textbox", { name: "Note" }), " v2");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(mockState().work.time.ada?.find((e) => e.id === "t1")).toMatchObject({
				minutes: 150,
				note: "Token API v2",
			}),
		);
		expect(row("Token API v2")).toHaveTextContent("2h30");
	});

	it("shows why a synced entry is not synced after an edit", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.logs["ACME-2"] = [];
		mountApp("/work/time");
		await user.click(await screen.findByRole("button", { name: /^Edit 2026-11-02 / }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Not in issue tracker: worklog");
	});

	it("refuses a bad duration and keeps the entry", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/time");
		await user.click(await screen.findByRole("button", { name: /^Edit 2026-11-02 / }));
		const duration = screen.getByRole("textbox", { name: "Duration" });
		await user.clear(duration);
		await user.type(duration, "soon");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Duration: 90, 1h30 or 2h");
		expect(mockState().work.time.ada?.find((e) => e.id === "t1")?.minutes).toBe(240);
	});

	it("deletes an entry after a confirm, and keeps it when the person declines", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp("/work/time");
		const del = await screen.findByRole("button", { name: /^Delete 2026-11-02 / });
		mockState().confirm = false;
		await user.click(del);
		expect(mockState().work.time.ada?.some((e) => e.id === "t1")).toBe(true);
		mockState().confirm = true;
		await user.click(screen.getByRole("button", { name: /^Delete 2026-11-02 / }));
		await waitFor(() => expect(mockState().work.time.ada?.some((e) => e.id === "t1")).toBe(false));
	});

	it("is in French when the language is French", async () => {
		mockState().prefs.lang = "fr";
		await withTracker();
		mountApp("/work/time");
		expect(await group("À envoyer (2)")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Saisie" })).toBeInTheDocument();
	});
});
