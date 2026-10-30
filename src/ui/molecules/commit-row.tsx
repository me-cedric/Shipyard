import { Avatar } from "../atoms/avatar";
import { Badge } from "../atoms/badge";
import { ContextMenu, type MenuItem } from "./context-menu";

export type CommitLabel = { name: string; kind: "branch" | "remote" | "tag" };

const VARIANT = { branch: "accent", remote: "neutral", tag: "warning" } as const;

/** One commit of the log: the short id, the summary, the labels, the author and the date. */
export function CommitRow({
	short,
	summary,
	author,
	date,
	labels,
	selected,
	onSelect,
	menu,
}: {
	short: string;
	summary: string;
	author: string;
	/** Already formatted for the language. */
	date: string;
	labels: CommitLabel[];
	selected?: boolean;
	onSelect: () => void;
	menu?: MenuItem[];
}) {
	return (
		<ContextMenu items={menu}>
			<button
				type="button"
				onClick={onSelect}
				aria-current={selected || undefined}
				className="flex min-h-row w-full items-center gap-2 rounded-md px-2 py-1 text-left text-ui transition-colors duration-(--duration-fast) hover:bg-n-3 aria-[current=true]:bg-accent-soft"
			>
				<span className="w-14 shrink-0 font-mono text-12 text-n-11">{short}</span>
				<span className="min-w-0 flex-1 truncate">{summary}</span>
				{labels.map((l) => (
					<Badge key={`${l.kind}:${l.name}`} variant={VARIANT[l.kind]}>
						{l.name}
					</Badge>
				))}
				<span className="flex shrink-0 items-center gap-1.5 text-12 text-n-11">
					<span aria-hidden="true">
						<Avatar name={author} className="size-5" />
					</span>
					{author}
				</span>
				<span className="shrink-0 text-12 text-n-11">{date}</span>
			</button>
		</ContextMenu>
	);
}
