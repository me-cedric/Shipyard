import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountAssistant } from "./harness";

const log = () => within(screen.getByRole("log", { name: "Messages" }));
const input = () => screen.getByRole("textbox", { name: "Message" });
const handle = () => screen.getByRole("separator", { name: "Width" });
const say = (user: ReturnType<typeof userEvent.setup>, text: string) =>
	user.type(input(), `${text}{Enter}`);

describe("assistant panel: trace", () => {
	it("collapses to one line when the turn ends and expands on demand", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "Where is the plan?");
		const summary = await log().findByText(/^Trace · 3 tools · \d+ ms$/);
		const details = summary.closest("details");
		expect(details).not.toHaveAttribute("open");
		await user.click(summary);
		expect(details).toHaveAttribute("open");
		const rows = within(details as HTMLElement).getAllByRole("listitem");
		expect(rows).toHaveLength(3);
		expect(rows[0]).toHaveTextContent("Read");
		expect(rows[0]).toHaveTextContent("120 ms");
	});

	it("shows the wait while the turn runs", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "Hello");
		// The pending turn shows the question and a status until the answer lands.
		await log().findByText("Here is the answer.");
		expect(log().queryByRole("status")).toBeNull();
	});
});

describe("assistant panel: context ring and quota windows", () => {
	it("shows the share of the context window with a text value", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		expect(screen.getByRole("meter", { name: "Context" })).toHaveAttribute("aria-valuenow", "0");
		await say(user, "long answer");
		await log().findByText("Here is the answer.");
		const ring = screen.getByRole("meter", { name: "Context" });
		expect(ring).toHaveAttribute("aria-valuenow", "60");
		expect(ring).toHaveAttribute("aria-valuetext", "60 %");
		expect(ring).toHaveTextContent("60 %");
	});

	it("shows a quota window only when the runner reports one", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		expect(screen.queryByRole("meter", { name: /Quota/ })).toBeNull();
		await user.click(screen.getByRole("combobox", { name: "Runner" }));
		await user.click(await screen.findByRole("option", { name: "codex" }));
		const quota = await screen.findByRole("meter", { name: "Quota 5h" });
		expect(quota).toHaveAttribute("aria-valuetext", "40 %");
	});
});

describe("assistant panel: reply buttons", () => {
	it("sends the option that the person clicks as the next turn", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "options");
		const options = within(await screen.findByRole("list", { name: "Options" }));
		expect(options.getAllByRole("button").map((b) => b.textContent)).toEqual([
			"Ship the change now",
			"Split it in two steps",
		]);
		await user.click(options.getByRole("button", { name: "Split it in two steps" }));
		// The option is the next user turn, and the buttons go with the old reply.
		await waitFor(() =>
			expect(log().getAllByText("Split it in two steps").length).toBeGreaterThanOrEqual(1),
		);
		await waitFor(() => expect(screen.queryByRole("list", { name: "Options" })).toBeNull());
		expect(mockState().assistant.threads[0]?.thread.messages.at(-2)?.text).toBe(
			"Split it in two steps",
		);
	});

	it("still takes a free answer", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await say(user, "options");
		await screen.findByRole("list", { name: "Options" });
		await say(user, "Neither, thanks");
		// The trace names the question too, so look at the user turns only.
		expect(await log().findAllByText("Neither, thanks")).not.toHaveLength(0);
		await log().findAllByText("Here is the answer.");
	});
});

describe("assistant panel: width and side", () => {
	it("resizes with the arrow keys, within 280 and 900, and keeps the width", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		expect(handle()).toHaveAttribute("aria-valuenow", "400");
		handle().focus();
		// On the right side the left arrow widens the panel.
		await user.keyboard("{ArrowLeft}");
		expect(handle()).toHaveAttribute("aria-valuenow", "416");
		await waitFor(() => expect(mockState().prefs.assistantWidth).toBe(416));
		await user.keyboard("{End}");
		expect(handle()).toHaveAttribute("aria-valuenow", "900");
		await user.keyboard("{ArrowLeft}");
		expect(handle()).toHaveAttribute("aria-valuenow", "900");
		await user.keyboard("{Home}");
		expect(handle()).toHaveAttribute("aria-valuenow", "280");
		expect(screen.getByRole("complementary", { name: "Assistant" })).toHaveStyle({
			width: "280px",
		});
	});

	it("resizes with a drag and saves the width when the drag ends", async () => {
		await mountAssistant();
		fireEvent.pointerDown(handle(), { clientX: 600, pointerId: 1 });
		fireEvent.pointerMove(handle(), { clientX: 500, pointerId: 1 });
		expect(handle()).toHaveAttribute("aria-valuenow", "500");
		expect(mockState().prefs.assistantWidth).toBe(400);
		fireEvent.pointerUp(handle(), { pointerId: 1 });
		await waitFor(() => expect(mockState().prefs.assistantWidth).toBe(500));
	});

	it("moves to the left and keeps the side", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.click(screen.getByRole("button", { name: "Move to the left" }));
		await waitFor(() => expect(mockState().prefs.assistantSide).toBe("left"));
		expect(screen.getByRole("button", { name: "Move to the right" })).toBeInTheDocument();
		handle().focus();
		// On the left side the right arrow widens it.
		await user.keyboard("{ArrowRight}");
		expect(handle()).toHaveAttribute("aria-valuenow", "416");
	});

	it("starts with the saved width and side", async () => {
		mockState().prefs.assistantWidth = 520;
		mockState().prefs.assistantSide = "left";
		await mountAssistant();
		await waitFor(() => expect(handle()).toHaveAttribute("aria-valuenow", "520"));
		expect(screen.getByRole("button", { name: "Move to the right" })).toBeInTheDocument();
	});
});

describe("assistant panel: warnings before a risky step", () => {
	const permission = () => screen.getByRole("combobox", { name: "Permission", hidden: true });

	it("names the effect of Auto and applies it only after the click", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.click(
			within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Agent" }),
		);
		await user.click(permission());
		await user.click(await screen.findByRole("option", { name: "Auto in worktree" }));
		const dialog = await screen.findByRole("dialog", { name: "Allow edits without approval" });
		expect(dialog).toHaveTextContent("It never runs shell commands");
		expect(permission()).toHaveTextContent("Edit with approval");
		await user.click(within(dialog).getByRole("button", { name: "Allow auto edits" }));
		await waitFor(() => expect(permission()).toHaveTextContent("Auto in worktree"));
	});

	it("asks for the Codex trust and writes it on the click", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		expect(screen.queryByText(/Codex does not trust/)).toBeNull();
		await user.click(screen.getByRole("combobox", { name: "Runner" }));
		await user.click(await screen.findByRole("option", { name: "codex" }));
		expect(await screen.findByText(/Codex does not trust this folder/)).toBeInTheDocument();
		expect(mockState().codexTrusted).toBe(false);
		await user.click(screen.getByRole("button", { name: "Trust this folder" }));
		await waitFor(() => expect(screen.queryByText(/Codex does not trust/)).toBeNull());
		expect(mockState().codexTrusted).toBe(true);
	});
});

describe("assistant panel: stop", () => {
	it("shows Stop while the turn runs and stops it with the button or Escape", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		type Turn = Awaited<ReturnType<typeof commands.assistantSend>>;
		let release: (v: Turn) => void = () => {};
		const send = vi
			.spyOn(commands, "assistantSend")
			.mockImplementation(() => new Promise<Turn>((r) => (release = r)));
		const stop = vi.spyOn(commands, "assistantStop");
		await say(user, "long job");
		expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
		await user.click(await screen.findByRole("button", { name: "Stop" }));
		expect(stop).toHaveBeenCalledOnce();
		await user.type(input(), "{Escape}");
		expect(stop).toHaveBeenCalledTimes(2);
		release({ status: "error", error: { code: "unknown", details: "stopped", action: null } });
		await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument());
		send.mockRestore();
		stop.mockRestore();
	});
});
