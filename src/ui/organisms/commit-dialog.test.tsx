import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { CommitDialog } from "./commit-dialog";

const setup = () => {
	const onSubmit = vi.fn().mockResolvedValue(undefined);
	renderApp(<CommitDialog open onOpenChange={() => {}} onSubmit={onSubmit} />);
	return onSubmit;
};

describe("CommitDialog", () => {
	it("submits the summary with the Commit button", async () => {
		const onSubmit = setup();
		await userEvent.type(screen.getByRole("textbox", { name: /summary/i }), "Fix it");
		await userEvent.click(screen.getByRole("button", { name: "Commit" }));
		expect(onSubmit).toHaveBeenCalledWith("Fix it", "");
	});

	it("submits with Cmd+Enter in the description", async () => {
		const onSubmit = setup();
		await userEvent.type(screen.getByRole("textbox", { name: /summary/i }), "Fix it");
		await userEvent.type(screen.getByRole("textbox", { name: /description/i }), "{Meta>}{Enter}");
		expect(onSubmit).toHaveBeenCalledWith("Fix it", "");
	});
});
