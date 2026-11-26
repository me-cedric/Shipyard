import { cn } from "@/lib/utils";
import { Avatar } from "../atoms/avatar";
import { Badge } from "../atoms/badge";
import { LockClosedIcon } from "../icons";

/** One member of the team on one line. The line opens the member. */
export function MemberRow({
	name,
	handle,
	job,
	capacity,
	skills,
	rate,
	lockedLabel,
	selected,
	onOpen,
}: {
	name: string;
	handle: string;
	job: string;
	/** `4 d/w` text. */
	capacity: string;
	skills: string[];
	/** The day rate as text. Absent while the seal hides it. */
	rate?: string;
	/** The name of the lock mark, when the seal hides the rate. */
	lockedLabel?: string;
	selected?: boolean;
	onOpen: () => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div
			role="group"
			aria-label={handle}
			className={cn("flex h-row items-center border-b hover:bg-n-3", selected && "bg-n-4")}
		>
			<button
				type="button"
				data-nav=""
				aria-current={selected ? "true" : undefined}
				onClick={onOpen}
				className="flex h-full min-w-0 flex-1 items-center gap-3 px-3 text-left"
			>
				<Avatar name={name} className="size-5 text-11" />
				<span className="w-40 shrink-0 truncate text-ui">{name}</span>
				<span className="w-24 shrink-0 truncate font-mono text-11 text-n-11">{handle}</span>
				<Badge className="w-16 shrink-0 justify-center">{job}</Badge>
				<span className="w-16 shrink-0 text-right font-mono text-11">{capacity}</span>
				<span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
					{skills.map((s) => (
						<Badge key={s}>{s}</Badge>
					))}
				</span>
				{rate ? (
					<span className="w-20 shrink-0 text-right font-mono text-11">{rate}</span>
				) : lockedLabel ? (
					<span role="img" aria-label={lockedLabel} className="w-20 shrink-0 text-right text-n-10">
						<LockClosedIcon size={12} />
					</span>
				) : null}
			</button>
		</div>
	);
}

export type Reason = { id: string; text: string; tone: "success" | "neutral" | "warning" };
