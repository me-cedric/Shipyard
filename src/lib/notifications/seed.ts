import type { Notice } from "./index";

/** The notices that the list starts with. Only the demo build sets them (`installMockIpc`): they make no toast. */
let seed: Notice[] = [];

export const seedNotices = (list: Notice[]) => {
	seed = list;
};

export const seededNotices = () => seed;
