import { featureOfRef } from "./ref-page";

describe("featureOfRef", () => {
	it("sends a change to the feature page on its Brief and a ticket to its page", () => {
		for (const [ref, search] of [
			["change:add-x", { section: "brief" }],
			["wi:ACME-2", { ticket: true }],
		] as const)
			expect(featureOfRef(ref)).toEqual({
				to: "/flow/feature/$featureId",
				params: { featureId: ref },
				search,
			});
	});
	it("leaves other refs alone", () => {
		expect(featureOfRef("adr:0001")).toBeUndefined();
	});
});
