import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";

/** The page that shows each artifact folder of the docs chain. */
const PAGE: Record<string, string> = {
	designs: "design/screens",
	models: "design/architecture",
	api: "design/api",
	data: "design/data",
	"test-plans": "specs/test-plans",
};

/**
 * The pages whose artifacts are out of date against their source, as `space/tab`. A warning that a
 * person acknowledged does not count. A project with no base branch has none.
 */
export function useStalePages(): ReadonlySet<string> {
	const active = Boolean(useActiveProject().data);
	const watch = useQuery({
		queryKey: ["code", "chain-watch", "pages"],
		queryFn: () => unwrap(commands.codeChainWatch(null)),
		enabled: active,
		retry: false,
		staleTime: 30_000,
	});
	const pages = (watch.data?.warnings ?? [])
		.filter((w) => !w.ack && PAGE[w.to])
		.map((w) => PAGE[w.to] as string);
	return new Set(pages);
}

/** A red dot on a tab. The name for assistive tools says what it means. */
export function StaleBadge() {
	const { t } = useI18n();
	return (
		<>
			<span aria-hidden="true" className="ml-1.5 size-2 rounded-full bg-danger" />
			<span className="sr-only">{t.review.chain.stale}</span>
		</>
	);
}
