import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("Settings / Connections / Certificates", () => {
	it("adds a PEM bundle, shows the count, refuses a bad file and removes it", async () => {
		const user = userEvent.setup();
		mountApp("/settings/connections");
		await screen.findByRole("heading", { name: "Certificates" });
		expect(await screen.findByText("None added")).toBeInTheDocument();

		mockState().nextFile = "/mock/notes.txt";
		await user.click(screen.getByRole("button", { name: "Add PEM bundle" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("no PEM certificate");

		mockState().nextFile = "/mock/proxy.pem";
		await user.click(screen.getByRole("button", { name: "Add PEM bundle" }));
		expect(await screen.findByText("1 certificates added")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Remove certificates" }));
		await waitFor(() => expect(screen.getByText("None added")).toBeInTheDocument());
	});
});
