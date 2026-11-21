import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "@/lib/utils";

export function Avatar({
	name,
	src,
	className,
	size = "m",
	agent,
}: {
	name: string;
	src?: string;
	className?: string;
	size?: "s" | "m";
	/** An agent: a dark square with round corners. A person is a circle. */
	agent?: boolean;
}) {
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");
	return (
		<BaseAvatar.Root
			aria-label={name}
			role="img"
			className={cn(
				"inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold",
				size === "s" ? "size-7 text-11" : "size-8 text-12",
				agent ? "rounded-sm bg-primary text-primary-fg" : "rounded-full bg-n-5 text-n-12",
				className,
			)}
		>
			{src ? <BaseAvatar.Image src={src} alt="" className="size-full object-cover" /> : null}
			<BaseAvatar.Fallback>{initials}</BaseAvatar.Fallback>
		</BaseAvatar.Root>
	);
}
