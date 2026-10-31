import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountAssistant } from "./harness";
import { filesTouched } from "./messages";

const log = () => within(screen.getByRole("log", { name: "Messages" }));
const input = () => screen.getByRole("textbox", { name: "Message" });

describe("assistant panel: tabs, quote, redo and file counts", () => {
	it("counts each file that a write tool touched once", () => {
		const step = (tool: string, target: string) => ({ tool, target, ms: 1 });
		expect(
			filesTouched([
				step("Read", "a.ts"),
				step("Edit", "a.ts"),
				step("Write", "b.ts"),
				step("Edit", "a.ts"),
			]),
		).toBe(2);
		expect(filesTouched([step("Read", "a.ts")])).toBe(0);
	}, 20_000);

	it("shows the file count of an agent turn, quotes a reply and redoes the last request", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		const pills = within(screen.getByRole("group", { name: "Mode" }));
		await user.click(pills.getByRole("button", { name: "Agent" }));
		await user.type(input(), "Change hello{Enter}");
		expect(await log().findByText("I changed src/hello.ts in the worktree.")).toBeInTheDocument();
		expect(log().getByText(/1 files/)).toBeInTheDocument();
		await user.click(log().getByRole("button", { name: "Quote" }));
		expect(input()).toHaveValue("> I changed src/hello.ts in the worktree.\n");
		await user.click(log().getByRole("button", { name: "Redo" }));
		await waitFor(() => expect(log().getAllByText("Change hello")).toHaveLength(2));
	}, 20_000);

	it("marks a thread with a newer reply as unread until the person opens it", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.click(screen.getByRole("button", { name: "New thread" }));
		const threads = () => within(screen.getByRole("list", { name: "Threads" }));
		await waitFor(() => expect(threads().getAllByRole("button")).toHaveLength(2));
		expect(threads().queryByText("Unread")).toBeNull();
		// A turn of the other thread ends while the person reads the new one.
		const [other] = [...mockState().assistant.threads].sort(
			(a, b) => a.thread.created - b.thread.created,
		);
		if (!other) throw new Error("no thread");
		other.thread.title = "Older";
		other.thread.updated += 100;
		await user.click(screen.getByRole("button", { name: "Rename" }));
		await user.keyboard("{Control>}a{/Control}Fresh{Enter}");
		const older = await threads().findByRole("button", { name: /Older/ });
		expect(within(older).getByText("Unread")).toBeInTheDocument();
		await user.click(older);
		await waitFor(() => expect(within(older).queryByText("Unread")).toBeNull());
	}, 20_000);
});
