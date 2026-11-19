import { useRouter } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useGraphFocus } from "@/lib/knowledge";
import { Button } from "@/ui/atoms/button";
import { MagnifyingGlassIcon } from "@/ui/icons";

/**
 * Open in graph centres the graph on the entity (REQ-004). Explain (REQ-008) is a main button of the
 * link card, in `RefDetail`; the palette runs the same Explain action.
 */
export function KnowledgeActions({ refId }: { refId: string }) {
	const { t } = useI18n();
	const [, setFocus] = useGraphFocus();
	// A view outside the router has no graph to open.
	const router = useRouter({ warn: false });
	return (
		<div className="flex flex-wrap gap-2">
			{router ? (
				<Button
					variant="ghost"
					onClick={() => {
						setFocus(refId);
						// On the map already: the view of the person stays.
						if (router.state.location.pathname !== "/library/graph")
							void router.navigate({ to: "/library/graph" });
					}}
				>
					<MagnifyingGlassIcon size={14} />
					{t.knowledge.openInGraph}
				</Button>
			) : null}
		</div>
	);
}
