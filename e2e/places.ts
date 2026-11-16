import { PLACE_IDS, sections } from "../src/features/shell/places";
import { tabLabel } from "../src/features/shell/spaces";
import { en } from "../src/lib/i18n/en";

/** The sidebar name of the place that holds a section, by the English name of the section (adr:0023). */
export function placeOf(section: string): string {
	const place = PLACE_IDS.find((p) => sections(p).some(([s, t]) => tabLabel(en, s, t) === section));
	if (!place) throw new Error(`No place holds ${section}`);
	return en.ui.place[place];
}
