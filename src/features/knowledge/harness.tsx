import { screen, within } from "@testing-library/react";
import { mountDesign } from "@/features/design/harness";
import { commands, unwrap } from "@/lib/ipc";
import { mountApp } from "@/test/mount";

/** One Knowledge tab in the whole app, on the mock project. */
export async function mountKnowledge(tab: string) {
	// jsdom has no matchMedia: the graph and the decks read it.
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	})) as unknown as typeof window.matchMedia;
	localStorage.clear();
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return mountApp(`/knowledge/${tab}`);
}

/** A node of the graph. jsdom measures no node, so xyflow keeps each one hidden. */
export const graphNode = async (id: string) =>
	within(await screen.findByTestId(`rf__node-${id}`)).getByRole("button", { hidden: true });

export const inspector = () => screen.findByRole("complementary", { name: "Inspector" });

/**
 * One Knowledge view alone in the shell: a dialog opens in it. In the whole app the click that opens
 * a dialog also closes it in jsdom.
 */
export function mountView(view: React.ReactElement) {
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener: () => {},
		removeEventListener: () => {},
	})) as unknown as typeof window.matchMedia;
	localStorage.clear();
	return mountDesign(view);
}
