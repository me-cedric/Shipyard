import { screen, within } from "@testing-library/react";
import { Api } from "./api";
import { mountDesign } from "./harness";

// spec:library-functions#REQ-013
describe("Link from an endpoint to its feature", () => {
	it("links the endpoint card to the change that cites the endpoint", async () => {
		await mountDesign(<Api />);
		const card = within(await screen.findByRole("region", { name: "GET /orders" }));
		const link = await card.findByRole("link", { name: "add-export" });
		expect(link).toHaveAttribute("href", expect.stringContaining("change%3Aadd-export"));
	});
});
