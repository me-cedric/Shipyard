import type { ReactNode } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { useI18n } from "@/lib/i18n";
import type { FlowFeature_Serialize as Feature } from "@/lib/ipc/bindings";
import { Button } from "@/ui/atoms/button";
import { CpuChipIcon } from "@/ui/icons";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { ContextMenu, type MenuItem } from "@/ui/molecules/context-menu";
import { Assignee } from "@/ui/molecules/ticket-row";
import { needsPerson, stateText, useOpenFeature } from "./feature";

/** Who works on a feature: a person with the avatar, an agent with the agent mark. */
function Who({ who }: { who: Feature["who"] }) {
	if (!who) return null;
	return who.agent ? (
		<span className="flex min-w-0 items-center gap-1.5 text-ui text-n-11">
			<CpuChipIcon size={16} />
			<span className="truncate">{nameOf(who.name)}</span>
		</span>
	) : (
		<Assignee name={who.name} />
	);
}

/**
 * A card of the board: the title, who works on it and its state. A person must act on it: the card
 * takes the attention colour, through `AttentionCard` only.
 */
export function FeatureCard({ feature: f, menu }: { feature: Feature; menu: MenuItem[] }) {
	const { t } = useI18n();
	const open = useOpenFeature();
	const state = stateText(t, f);
	const key = f.ticket?.replace(/^wi:/, "");
	return (
		<ContextMenu items={menu}>
			{needsPerson(f) ? (
				<AttentionCard who={state} title={f.title}>
					<Who who={f.who} />
					<Button className="min-h-control" onClick={() => open(f)}>
						{t.flow.menu.open}
						<span className="sr-only">
							{" "}
							{f.title}
							{key ? ` ${key}` : ""}
						</span>
					</Button>
				</AttentionCard>
			) : (
				<button
					type="button"
					onClick={() => open(f)}
					className="flex min-h-control w-full flex-col gap-2 rounded-xl border bg-surface-2 p-3 text-left shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2 focus-visible:shadow-glow"
				>
					<span className="line-clamp-2 text-ui font-medium text-n-12">
						{f.title}
						{key ? <span className="sr-only"> {key}</span> : null}
					</span>
					<Who who={f.who} />
					<span className="text-13 text-n-11">{state}</span>
				</button>
			)}
		</ContextMenu>
	);
}

/** One row of the list: the title, the stage, who and the state. A row opens like a card. */
export function FeatureRow({
	feature: f,
	menu,
	facts,
}: {
	feature: Feature;
	menu: MenuItem[];
	/** The facts of the ticket, next to the title. */
	facts?: ReactNode;
}) {
	const { t } = useI18n();
	const open = useOpenFeature();
	const key = f.ticket?.replace(/^wi:/, "");
	return (
		<ContextMenu items={menu}>
			<button
				type="button"
				onClick={() => open(f)}
				className="grid min-h-control w-full grid-cols-[minmax(0,3fr)_6rem_minmax(0,2fr)_minmax(0,2fr)] items-center gap-3 border-b px-3 text-left text-ui hover:bg-n-3 focus-visible:shadow-glow"
			>
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium text-n-12">
						{f.title}
						{key ? <span className="sr-only">{` ${key}, `}</span> : null}
					</span>
					{facts}
				</span>
				<span className="text-n-11">{t.flow.stages[f.stage]}</span>
				<Who who={f.who} />
				<span className={needsPerson(f) ? "font-medium text-n-12" : "text-n-11"}>
					{stateText(t, f)}
				</span>
			</button>
		</ContextMenu>
	);
}
