import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderApp } from "../test-utils";
import { AdrDecision } from "./adr-decision";

const labels = { accept: "Accept", reject: "Reject", comment: "Comment" };

describe("AdrDecision", () => {
	it("accepts with no comment", async () => {
		const onAccept = vi.fn();
		renderApp(<AdrDecision onAccept={onAccept} onReject={() => {}} labels={labels} />);
		await userEvent.click(screen.getByRole("button", { name: "Accept" }));
		expect(onAccept).toHaveBeenCalled();
	});

	it("needs a comment to reject", async () => {
		const onReject = vi.fn();
		renderApp(<AdrDecision onAccept={() => {}} onReject={onReject} labels={labels} />);
		const reject = screen.getByRole("button", { name: "Reject" });
		expect(reject).toBeDisabled();
		await userEvent.type(screen.getByRole("textbox", { name: "Comment" }), "  too costly ");
		await userEvent.click(reject);
		expect(onReject).toHaveBeenCalledWith("too costly");
	});
});
