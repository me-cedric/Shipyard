/** The scope page of each Settings tab of before `adr:0023` (`spec:app-redesign#REQ-024`). */
const TAB: Record<string, string> = {
	project: "/setup/project",
	connections: "/setup/computer",
	"agents-rules": "/setup/computer?page=models",
	extensions: "/setup/project?page=extensions",
	me: "/setup/me",
	health: "/setup/project?page=health",
};

const ACCOUNTS = "/setup/project?page=connections";
const LOOK = "/setup/me?page=look";
const COMPUTER_HEALTH = "/setup/computer?page=health";
const LOGS = "/setup/computer?page=logs";

/** The anchors that left the page of their old tab, as `tab#anchor`. */
const ANCHOR: Record<string, string> = {
	"project#section-tickets": "/setup/project?page=tickets",
	"project#pickup-label": "/setup/project?page=automation",
	"health#doctor-bootstrap": "/setup/project?page=extensions",
	"connections#connections": ACCOUNTS,
	"connections#connections-tracker": ACCOUNTS,
	"connections#connections-forge": ACCOUNTS,
	"connections#connections-outside": "/setup/computer?page=share",
	"me#section-setup": "/setup/start",
	"me#section-fonts": LOOK,
	"me#avatar": "/setup/me",
	"me#text-size": "/setup/me",
	...Object.fromEntries(
		[
			"ui-font",
			"code-font",
			"accent",
			"nav-side",
			"drawer-side",
			"narrow-bar",
			"tray",
			"motion",
			"focus-ring",
			"focus-width",
			"look-preview",
			"all-pages",
			"date-format",
			"close-push",
			"data-folder",
		].map((id) => [`me#${id}`, LOOK]),
	),
	"health#tools": COMPUTER_HEALTH,
	"health#health-tools": COMPUTER_HEALTH,
	"health#doctor-console": LOGS,
	"health#doctor-feedback": LOGS,
};

/**
 * The address in Setup of a Settings tab of before, with its anchor: `setupAddress("me", "#ui-font")`
 * is `/setup/me?page=look#ui-font`. Undefined when the tab is not a Settings tab. The permissions
 * and the tour keep the address of Me: `SetupMe` sends them to This computer for a role that sees it.
 */
export function setupAddress(tab: string, hash = ""): string | undefined {
	const id = hash.replace(/^#/, "");
	const to = ANCHOR[`${tab}#${id}`] ?? TAB[tab];
	return to && id ? `${to}#${id}` : to;
}

/** The page ids of before look pass 2 that are a card of the first page of their scope now, as `scope/id`: the anchor of the card. */
const OLD_PAGE: Record<string, string> = {
	// The issue tracker and the code host are cards of Details.
	"project/connections": "connections",
};

/**
 * The anchor on the first page of a scope for a page id of before: `oldPageAnchor("project",
 * "connections")` is `connections`, and undefined for another id. `SetupScope` uses it when no page of
 * the scope has the id, so `/setup/project?page=connections` keeps its page until Details holds the cards.
 */
export const oldPageAnchor = (scope: string, id: string): string | undefined =>
	OLD_PAGE[`${scope}/${id}`];
