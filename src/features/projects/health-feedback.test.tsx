import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { DATA_PATH } from "@/lib/ipc/mock-extras";
import { mountApp } from "@/test/mount";

// spec:shell-setup-rights#REQ-009: Attach a file shows the file in the file manager and sends nothing.
describe("Setup / Logs and feedback: Attach a file", () => {
	it("copies the file into the data folder, shows the copy in the file manager and sends nothing", async () => {
		const user = userEvent.setup();
		const reveal = vi.spyOn(commands, "revealPath");
		const open = vi.spyOn(commands, "feedbackOpen");
		const mail = vi.spyOn(commands, "feedbackMail");
		mountApp("/setup/computer?page=logs");
		mockState().nextFile = "/Users/ada/Desktop/shot.png";
		const feedback = within(await screen.findByRole("region", { name: "Feedback" }));
		await user.click(feedback.getByRole("button", { name: "Attach a file" }));
		await waitFor(() => expect(reveal).toHaveBeenCalledWith(`${DATA_PATH}/feedback/shot.png`));
		expect(await feedback.findByText("Shown in the file manager")).toBeVisible();
		// The app sends nothing: no issue opens and no mail is made.
		expect(open).not.toHaveBeenCalled();
		expect(mail).not.toHaveBeenCalled();
		expect(mockState().extras.attached).toEqual([`${DATA_PATH}/feedback/shot.png`]);
	});

	it("keeps a second file of the same name apart and refuses a call that is not a click", async () => {
		const a = await unwrap(commands.feedbackAttach("/Users/ada/a b.png", true));
		const b = await unwrap(commands.feedbackAttach("/Users/ada/a b.png", true));
		expect(a).not.toBe(b);
		await expect(unwrap(commands.feedbackAttach("/Users/ada/a.png", false))).rejects.toBeDefined();
		await expect(unwrap(commands.feedbackAttach("a.png", true))).rejects.toBeDefined();
	});
});
