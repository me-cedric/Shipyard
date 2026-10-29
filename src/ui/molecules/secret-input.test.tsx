import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderApp } from "../test-utils";
import { MASK, SecretInput } from "./secret-input";

function Field({ saved }: { saved: boolean }) {
	const [value, setValue] = useState("");
	return <SecretInput label="Secret" saved={saved} value={value} onChange={setValue} />;
}

describe("SecretInput", () => {
	it("masks the typed text and shows no mask while nothing is saved", async () => {
		renderApp(<Field saved={false} />);
		const input = screen.getByLabelText("Secret");
		expect(input).toHaveAttribute("type", "password");
		expect(input).not.toHaveAttribute("placeholder");
		await userEvent.type(input, "abc");
		expect(input).toHaveValue("abc");
	});

	it("shows the mask for a saved secret and keeps the value empty", () => {
		renderApp(<Field saved />);
		const input = screen.getByLabelText("Secret");
		expect(input).toHaveAttribute("placeholder", MASK);
		expect(input).toHaveValue("");
		expect(input).toHaveAttribute("autocomplete", "off");
	});
});
