import { describe, expect, it } from "vitest";
import { automationSave, seedSync } from "./mock-sync";

// As `automation_save`: a save only narrows the permissions of the recipes.
const withPermission = () => {
	const sync = seedSync();
	sync.file = "valid";
	sync.automation.recipe_writes = { feature: ["transition", "open_pr"] };
	return sync;
};

describe("automationSave", () => {
	it("removes the kind that the form removes, and the recipe with its last kind", () => {
		const sync = withPermission();
		automationSave(sync, { ...sync.automation, recipe_writes: { feature: ["transition"] } });
		expect(sync.automation.recipe_writes).toEqual({ feature: ["transition"] });
		automationSave(sync, { ...sync.automation, recipe_writes: {} });
		expect(sync.automation.recipe_writes).toBeUndefined();
	});

	it("adds no kind and no recipe", () => {
		const sync = withPermission();
		automationSave(sync, {
			...sync.automation,
			recipe_writes: { feature: ["transition", "open_pr", "push"], bug: ["push"] },
		});
		expect(sync.automation.recipe_writes).toEqual({ feature: ["transition", "open_pr"] });
	});

	it("changes nothing for the same permissions", () => {
		const sync = withPermission();
		const before = structuredClone(sync.automation);
		automationSave(sync, structuredClone(before));
		expect(sync.automation).toEqual(before);
	});
});
