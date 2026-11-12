import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { renderApp } from "../test-utils";
import { ViewTabs } from "./view-tabs";

const TABS = [
	{ value: "a", label: "Alpha" },
	{ value: "b", label: "Beta" },
];

function Row({ label }: { label: string }) {
	const [value, setValue] = useState("a");
	return <ViewTabs label={label} value={value} onValueChange={setValue} tabs={TABS} />;
}

// update-ux-declutter REQ-022: an inner tab row moves its mark with a sliding pill.
describe("ViewTabs (REQ-022)", () => {
	it("keeps one pill in the selected tab and moves it to the picked tab", () => {
		renderApp(<Row label="Views" />);
		const list = screen.getByRole("tablist", { name: "Views" });
		const pill = (name: string) => screen.getByRole("tab", { name }).querySelector("[data-pill]");
		expect(list.querySelectorAll("[data-pill]")).toHaveLength(1);
		expect(pill("Alpha")).not.toBeNull();
		fireEvent.click(within(list).getByRole("tab", { name: "Beta" }));
		expect(list.querySelectorAll("[data-pill]")).toHaveLength(1);
		expect(pill("Beta")).not.toBeNull();
		expect(pill("Alpha")).toBeNull();
	});

	it("gives each row its own pill", () => {
		renderApp(
			<>
				<Row label="First" />
				<Row label="Second" />
			</>,
		);
		for (const name of ["First", "Second"])
			expect(screen.getByRole("tablist", { name }).querySelectorAll("[data-pill]")).toHaveLength(1);
	});
});
