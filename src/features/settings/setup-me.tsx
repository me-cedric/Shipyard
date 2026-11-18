import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { usePermissionsPlace } from "@/features/onboarding";
import { useI18n } from "@/lib/i18n";
import { useRightsView } from "@/lib/rights";
import { SwatchIcon } from "@/ui/icons";
import { Me } from "./me";
import { SetupScope } from "./setup-scope";

/** The anchors of the permissions and of Replay the tour. */
const PERMISSIONS = /^(section-permissions|permission-.+|tour)$/;

/**
 * Setup / Me (`spec:app-redesign#REQ-024`): what belongs to the person. The theme, the language,
 * the role, the terminal, the default agent and the notifications, and one door to the look.
 * A role that does not see This computer has the permissions here (`spec:app-redesign#REQ-006`).
 */
export function SetupMe() {
	const { t } = useI18n();
	const router = useRouter();
	const hash = useRouterState({ select: (s) => s.location.hash });
	const place = usePermissionsPlace();
	// The level is `write` until the rights load: the link waits for them.
	const ready = !useRightsView().isLoading;
	const away = ready && place !== "/setup/me" && PERMISSIONS.test(hash);
	useEffect(() => {
		if (away) router.history.replace(`${place}#${hash}`);
	}, [away, place, hash, router]);
	return (
		<SetupScope
			scope="me"
			pages={[
				{
					id: "look",
					label: t.settings.pages.look,
					icon: <SwatchIcon size={24} />,
					view: <Me part="look" />,
				},
			]}
		>
			<Me part="main" permissions={place === "/setup/me"} />
		</SetupScope>
	);
}
