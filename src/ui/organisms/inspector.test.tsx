import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderApp } from "../test-utils";
import { Inspector } from "./inspector";

function Host() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<main tabIndex={-1}>
				<button type="button" onClick={() => setOpen(true)}>
					Open
				</button>
			</main>
			<Inspector open={open} onClose={() => setOpen(false)} title="Card">
				<p>Body</p>
			</Inspector>
		</>
	);
}

const close = () => userEvent.click(screen.getByRole("button", { name: /close/i }));

describe("Inspector", () => {
	it("returns the focus to the element that opened it", async () => {
		renderApp(<Host />);
		const opener = screen.getByRole("button", { name: "Open" });
		await userEvent.click(opener);
		await close();
		expect(opener).toHaveFocus();
	});

	it("falls back to the main view when the opener is gone", async () => {
		renderApp(<Host />);
		const opener = screen.getByRole("button", { name: "Open" });
		await userEvent.click(opener);
		opener.remove();
		await close();
		expect(screen.getByRole("main")).toHaveFocus();
	});
});
