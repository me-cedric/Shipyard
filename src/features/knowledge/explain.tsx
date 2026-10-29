import { useRouter } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useGraphFocus } from "@/lib/knowledge";
import { useShell } from "@/lib/shell";
import { Button } from "@/ui/atoms/button";
import { BookOpenIcon, MagnifyingGlassIcon } from "@/ui/icons";

/**
 * The two actions of every entity in the inspector. Explain opens the assistant with the entity as
 * context and asks for the cited answer (REQ-008). Open in graph centres the graph on it (REQ-004).
 * The palette runs the same Explain action.
 */
export function KnowledgeActions({ refId }: { refId: string }) {
	const { t } = useI18n();
	const { explain } = useShell();
	const [, setFocus] = useGraphFocus();
	// A view outside the router has no graph to open.
	const router = useRouter({ warn: false });
	return (
		<div className="flex flex-wrap gap-2">
			<Button variant="ghost" onClick={() => explain(refId)}>
				<BookOpenIcon size={14} />
				{t.knowledge.explain}
			</Button>
			{router ? (
				<Button
					variant="ghost"
					onClick={() => {
						setFocus(refId);
						void router.navigate({ to: "/knowledge/graph" });
					}}
				>
					<MagnifyingGlassIcon size={14} />
					{t.knowledge.openInGraph}
				</Button>
			) : null}
		</div>
	);
}
