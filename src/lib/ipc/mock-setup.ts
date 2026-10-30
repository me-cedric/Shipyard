// The mock of the setup helpers: a connection from the git remote, the scope list of a tracker and
// the token page. The rules are those of `crates/shipyard-app/src/commands/setup.rs`.
import type { ConnectionKind, ConnectionSuggestion_Serialize, ScopeChoice } from "./bindings";

/** What the origin remote of the demo project suggests. */
export const SUGGESTION: ConnectionSuggestion_Serialize = {
	kind: "github",
	name: "GitHub",
	url: "https://github.com",
};

const host = (url: string) => {
	const m = url.trim().match(/^https:\/\/([^/?#]+)/i);
	if (!m?.[1]) throw "bad address: use an https address";
	return m[1].toLowerCase();
};

/** The page where a person makes a token. */
export function tokenPage(kind: ConnectionKind, url: string): string {
	switch (kind) {
		case "github":
			return `https://${host(url)}/settings/tokens`;
		case "gitlab":
			return `https://${host(url)}/-/user_settings/personal_access_tokens`;
		case "azure-dev-ops":
			return `https://${url
				.trim()
				.replace(/^https:\/\//, "")
				.replace(/\/+$/, "")}/_usersSettings/tokens`;
		case "jira-cloud":
			return "https://id.atlassian.com/manage-profile/security/api-tokens";
		case "jira-data-center":
			return `https://${host(url)}/secure/ViewProfile.jspa`;
		case "linear":
			return "https://linear.app/settings/account/security";
	}
}

const SCOPES: Record<ConnectionKind, string[]> = {
	"jira-cloud": ["ACME", "OPS"],
	"jira-data-center": ["ACME", "OPS"],
	github: ["acme/web", "acme/docs"],
	gitlab: ["acme/web", "acme/docs"],
	"azure-dev-ops": ["Web", "Docs"],
	linear: ["ACME", "OPS"],
};

export const scopesOf = (kind: ConnectionKind): ScopeChoice[] =>
	SCOPES[kind].map((id) => ({ id, name: id }));
