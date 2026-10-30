import { cn } from "@/lib/utils";
import { Avatar } from "../atoms/avatar";
import { Badge } from "../atoms/badge";
import { Ring } from "../atoms/ring";
import { LockClosedIcon } from "../icons";
import { Card } from "./card";

/** One member of the team as a card: avatar, role, capacity ring, skills and rate. The card opens the member. */
export function MemberCard({
	name,
	handle,
	job,
	capacity,
	capacityText,
	capacityLabel,
	skills,
	rate,
	lockedLabel,
	selected,
	onOpen,
}: {
	name: string;
	handle: string;
	job: string;
	/** Days per week, out of five. */
	capacity: number;
	/** `4 d/w` text. */
	capacityText: string;
	capacityLabel: string;
	skills: string[];
	/** The day rate as text. Absent while the seal hides it. */
	rate?: string;
	lockedLabel?: string;
	selected?: boolean;
	onOpen: () => void;
}) {
	return (
		<Card
			role="group"
			aria-label={handle}
			className={cn("overflow-hidden", selected && "border-accent shadow-glow")}
		>
			<button
				type="button"
				data-nav=""
				aria-current={selected ? "true" : undefined}
				onClick={onOpen}
				className="flex w-full flex-col gap-3 p-3 text-left"
			>
				<span className="flex items-center gap-3">
					<Avatar
						name={name}
						className="size-10 border-0 bg-accent-gradient text-13 font-semibold text-accent-fg shadow-glow"
					/>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-14 font-medium text-n-12">{name}</span>
						<span className="truncate font-mono text-11 text-n-11">{handle}</span>
					</span>
					<Ring value={capacity} max={5} label={capacityLabel}>
						{capacity}
					</Ring>
				</span>
				<span className="flex items-center gap-2">
					<Badge variant="accent">{job}</Badge>
					<span className="flex-1 font-mono text-11 text-n-11">{capacityText}</span>
					{rate ? (
						<span className="font-mono text-12 text-n-12">{rate}</span>
					) : lockedLabel ? (
						<span role="img" aria-label={lockedLabel} className="text-n-10">
							<LockClosedIcon size={12} />
						</span>
					) : null}
				</span>
				{skills.length ? (
					<span className="flex flex-wrap gap-1">
						{skills.map((s) => (
							<Badge key={s} className="rounded-full">
								{s}
							</Badge>
						))}
					</span>
				) : null}
			</button>
		</Card>
	);
}
