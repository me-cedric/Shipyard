import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

const group = async (name: string) => screen.findByRole("heading", { name });
/** The entries of the month, each with Send, Edit and Delete: a page of Time. */
const ENTRIES = "/plan/time?page=entries";
type Router = ReturnType<typeof mountApp>;
const toEntries = (router: Router) =>
	router.navigate({ to: "/plan/time", search: { page: "entries" } as never });
const idle = (router: Router) => waitFor(() => expect(router.state.status).toBe("idle"));
/** The form of a new entry, from the week grid. */
const openForm = async (user: ReturnType<typeof userEvent.setup>) =>
	user.click(await screen.findByRole("button", { name: "Add a ticket" }));
const submit = () =>
	screen
		.getAllByRole("button", { name: "Add a ticket" })
		.find((b) => b.getAttribute("type") === "submit") as HTMLElement;
const row = (text: string) => screen.getByText(text).closest("[role=row]") as HTMLElement;

describe("Plan / Time", () => {
	it("lists the entries of the month by state", async () => {
		await withTracker();
		mountApp(ENTRIES);
		expect(await group("To send (2)")).toBeInTheDocument();
		expect(await group("In issue tracker (1)")).toBeInTheDocument();
		expect(row("Token API")).toHaveTextContent("4h");
		expect(row("Review of the login")).toHaveTextContent("3h");
	});

	it("adds an entry for a resolved member and writes one file of that member", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const router = mountApp("/plan/time");
		await openForm(user);
		await user.type(screen.getByRole("textbox", { name: "Duration" }), "2h");
		await user.type(screen.getByRole("textbox", { name: "Note" }), "Pairing");
		await user.click(submit());
		await waitFor(() => expect(mockState().work.time.ada).toHaveLength(4));
		expect(mockState().work.time.ada?.find((e) => e.note === "Pairing")).toMatchObject({
			day: "2026-11-02",
			minutes: 120,
		});
		expect(mockState().work.time.grace).toHaveLength(1);
		await toEntries(router);
		expect(await group("To send (3)")).toBeInTheDocument();
		await idle(router);
	});

	it("offers the full key and the title of a ticket, filtered by either, and picks one with the keys", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mountApp("/plan/time");
		await openForm(user);
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
		mountApp("/plan/time");
		await openForm(user);
		await user.type(screen.getByRole("textbox", { name: "Duration" }), "1h");
		await user.type(screen.getByRole("combobox", { name: "Ticket" }), "ACME-1");
		await user.click(submit());
		await waitFor(() =>
			expect(
				mockState().work.time.ada?.find((e) => e.ticket === "ACME-1" && e.minutes === 60)?.worklog,
			).toBeDefined(),
		);
	});

	it("opens the crew with the Member button focused when the person is not in the team", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.me = null;
		const router = mountApp("/plan/time");
		expect(await screen.findByRole("alert")).toHaveTextContent("You are not in the team yet.");
		await user.click(screen.getByRole("button", { name: "Open" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/crew/crew"));
		await waitFor(() => expect(screen.getByRole("button", { name: "Member" })).toHaveFocus());
	});

	it("offers one action when there is no team, and it adds the signed-in person", async () => {
		const user = userEvent.setup();
		await withTracker();
		mockState().work.team = { members: [] };
		mockState().work.me = null;
		mountApp("/plan/time");
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
		mountApp("/plan/time");
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
		mountApp(ENTRIES);
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
		mountApp(ENTRIES);
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
		mountApp(ENTRIES);
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
		mountApp(ENTRIES);
		await group("To send (2)");
		expect(row("Stand-up and planning").querySelector("button")).toBeDisabled();
	});

	it("never sends twice when the answer is lost: it finds the mark and stores the receipt", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mockState().work.loseNextAnswer = true;
		mountApp(ENTRIES);
		await group("To send (2)");
		const before = mockState().work.logs["ACME-1"]?.length ?? 0;
		await user.click(screen.getByRole("button", { name: /^Send 2026-11-03 ACME-1$/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent("the answer was lost");
		expect(mockState().work.logs["ACME-1"]).toHaveLength(before + 1);
		await user.click(screen.getByRole("button", { name: "Read the month from the issue tracker" }));
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
		mountApp(ENTRIES);
		await group("In issue tracker (1)");
		await user.click(screen.getByRole("button", { name: "Read the month from the issue tracker" }));
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
		mountApp(ENTRIES);
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
		mountApp(ENTRIES);
		await user.click(await screen.findByRole("button", { name: /^Edit 2026-11-02 / }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Not in issue tracker: worklog");
	});

	it("refuses a bad duration and keeps the entry", async () => {
		const user = userEvent.setup();
		await withTracker();
		mountApp(ENTRIES);
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
		mountApp(ENTRIES);
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
		const router = mountApp("/plan/time");
		expect(await screen.findByRole("heading", { level: 1, name: "Mon temps" })).toBeInTheDocument();
		expect(await screen.findByRole("button", { name: "Ajouter un ticket" })).toBeInTheDocument();
		await toEntries(router);
		expect(await group("À envoyer (2)")).toBeInTheDocument();
		await idle(router);
	});

	it("keeps the receipt of each lost answer with one click, and sends nothing again", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		mockState().work.loseNextAnswer = true;
		const router = mountApp(ENTRIES);
		await group("To send (2)");
		const before = mockState().work.logs["ACME-1"]?.length ?? 0;
		await user.click(screen.getByRole("button", { name: /^Send 2026-11-03 ACME-1$/ }));
		expect(await screen.findByRole("alert")).toHaveTextContent("the answer was lost");
		await router.navigate({ to: "/plan/time" });
		const keep = await screen.findByRole("button", { name: "Keep a receipt" });
		// Nothing to keep before the month is read from the issue tracker.
		expect(keep).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Read the month from the issue tracker" }));
		await waitFor(() => expect(keep).toBeEnabled());
		await user.click(keep);
		await waitFor(() =>
			expect(mockState().work.time.ada?.find((e) => e.id === "t2")?.worklog).toBeDefined(),
		);
		expect(mockState().work.logs["ACME-1"]).toHaveLength(before + 1);
		await idle(router);
	});

	it("lists the hours of each person of the team, and opens the week of one person", async () => {
		const user = userEvent.setup();
		await withTracker();
		const router = mountApp("/plan/time?page=team");
		expect(
			await screen.findByRole("heading", { level: 1, name: "Time of the team" }),
		).toBeInTheDocument();
		await user.click(await screen.findByRole("link", { name: /Grace Hopper/ }));
		await waitFor(() => expect(router.state.location.search).toEqual({ member: "grace" }));
		expect(
			await screen.findByRole("heading", { level: 1, name: "Time of Grace" }),
		).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Member" })).toHaveTextContent("Grace Hopper");
		await idle(router);
	});

	// spec:app-redesign#REQ-019
	describe("the week grid", () => {
		/** The field of a ticket on a day. The row shows the title of the ticket; its key is the title of the name. */
		const cell = async (ticket: string, day: string) => {
			const name = ticket === "No ticket" ? screen.findByText(ticket) : screen.findByTitle(ticket);
			return within((await name).closest("tr") as HTMLElement).getByRole("textbox", {
				// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- test input is a fixed day
				name: new RegExp(`^Hours of .+, ${day}$`),
			});
		};

		it("shows the hours of each ticket on each day of the week, and moves by a week", async () => {
			const user = userEvent.setup();
			await withTracker();
			mountApp("/plan/time");
			const week = within(await screen.findByRole("region", { name: "Week of 2 Nov" }));
			expect(screen.getByRole("heading", { level: 1, name: "My time" })).toBeInTheDocument();
			expect(await cell("ACME-2", "Monday 2 Nov")).toHaveValue("4h");
			expect(await cell("No ticket", "Tuesday 3 Nov")).toHaveValue("1h");
			// Five working days: the weekend has no entry, so it has no column and no control.
			expect(week.getAllByRole("columnheader")).toHaveLength(6);
			expect(week.queryByRole("button", { name: "Weekend" })).toBeNull();
			// The entry that the issue tracker does not hold has the mark.
			expect(week.getAllByRole("img", { name: "To send" })).toHaveLength(2);
			// The ways to the time of the team and to the send of the hours.
			expect(screen.getByRole("link", { name: "Time of the team" })).toBeInTheDocument();
			expect(
				screen.getByRole("link", { name: /^Send the hours to the issue tracker/ }),
			).toHaveAttribute("href", expect.stringContaining("page=entries"));
			await user.click(screen.getByRole("button", { name: "Next week" }));
			expect(await screen.findByRole("region", { name: "Week of 9 Nov" })).toBeInTheDocument();
			// A week of the month before shows its month.
			await user.click(screen.getByRole("button", { name: "Previous week" }));
			await user.click(screen.getByRole("button", { name: "Previous week" }));
			await user.click(screen.getByRole("button", { name: "Previous week" }));
			expect(await screen.findByRole("region", { name: "Week of 19 Oct" })).toBeInTheDocument();
			expect(screen.getByText("October 2026")).toBeInTheDocument();
		});

		it("changes, adds and deletes an entry from a cell", async () => {
			const user = userEvent.setup();
			await withTracker();
			await importAll();
			mountApp("/plan/time");
			const first = await cell("ACME-2", "Monday 2 Nov");
			await user.clear(first);
			await user.type(first, "2h{Enter}");
			await waitFor(() =>
				expect(mockState().work.time.ada?.find((e) => e.id === "t1")).toMatchObject({
					minutes: 120,
					note: "Token API",
				}),
			);
			await user.type(await cell("ACME-1", "Wednesday 4 Nov"), "1h30{Enter}");
			await waitFor(() =>
				expect(mockState().work.time.ada?.find((e) => e.day === "2026-11-04")).toMatchObject({
					minutes: 90,
					ticket: "ACME-1",
				}),
			);
			mockState().confirm = false;
			await user.clear(await cell("ACME-1", "Tuesday 3 Nov"));
			await user.tab();
			await waitFor(async () => expect(await cell("ACME-1", "Tuesday 3 Nov")).toHaveValue("3h"));
			expect(mockState().work.time.ada?.some((e) => e.id === "t2")).toBe(true);
			mockState().confirm = true;
			await user.clear(await cell("ACME-1", "Tuesday 3 Nov"));
			await user.tab();
			await waitFor(() =>
				expect(mockState().work.time.ada?.some((e) => e.id === "t2")).toBe(false),
			);
		});

		it("keeps the note of an entry of the month beside after a change of its hours", async () => {
			const user = userEvent.setup();
			await withTracker();
			mockState().work.time.ada?.push({
				id: "t9",
				day: "2026-10-30",
				minutes: 60,
				note: "Old note\nsecond line",
				ticket: "ACME-3",
			});
			mountApp("/plan/time");
			await user.click(await screen.findByRole("button", { name: "Previous week" }));
			const field = await cell("ACME-3", "Friday 30 Oct");
			await user.clear(field);
			await user.type(field, "2h{Enter}");
			await waitFor(() =>
				expect(mockState().work.time.ada?.find((e) => e.id === "t9")?.minutes).toBe(120),
			);
			expect(mockState().work.time.ada?.find((e) => e.id === "t9")?.note).toBe(
				"Old note\nsecond line",
			);
		});

		it("changes the first line of the note of a row and keeps the hours", async () => {
			const user = userEvent.setup();
			await withTracker();
			mountApp("/plan/time");
			const row = (await screen.findByTitle("ACME-2")).closest("tr") as HTMLElement;
			const note = within(row).getByRole("textbox", { name: /^Note for / });
			expect(note).toHaveValue("Token API");
			await user.clear(note);
			await user.type(note, "Token API, part two{Enter}");
			await waitFor(() =>
				expect(mockState().work.time.ada?.find((e) => e.id === "t1")).toMatchObject({
					minutes: 240,
					note: "Token API, part two",
				}),
			);
		});

		it("refuses a bad duration in a cell and shows the stored hours again", async () => {
			const user = userEvent.setup();
			await withTracker();
			mountApp("/plan/time");
			await user.type(await cell("ACME-2", "Monday 2 Nov"), "x{Enter}");
			expect(await screen.findByRole("alert")).toHaveTextContent("Duration: 90, 1h30 or 2h");
			expect(await cell("ACME-2", "Monday 2 Nov")).toHaveValue("4h");
			expect(mockState().work.time.ada?.find((e) => e.id === "t1")?.minutes).toBe(240);
		});
	});
});
