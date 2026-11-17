import { featureOfRef } from "./ref-page";

describe("featureOfRef", () => {
	it("sends a change and a ticket to the feature page, on the Brief", () => {
		for (const ref of ["change:add-x", "wi:ACME-2"])
			expect(featureOfRef(ref)).toEqual({
				to: "/flow/feature/$featureId",
				params: { featureId: ref },
				search: { section: "brief" },
			});
	});
	it("leaves other refs alone", () => {
		expect(featureOfRef("adr:0001")).toBeUndefined();
	});
});
