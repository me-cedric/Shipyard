/** The sections of the feature page, in the order of the switch. The open one is in the address. */
export const SECTIONS = ["story", "brief", "design", "changes", "checks", "chat"] as const;
export type Section = (typeof SECTIONS)[number];

/** The section that opens first for the ref of a part: a change opens Brief, a pull request opens Changes, the rest Story. */
export const sectionOfRef = (ref: string): Section =>
	ref.startsWith("change:") ? "brief" : ref.startsWith("pr:") ? "changes" : "story";
