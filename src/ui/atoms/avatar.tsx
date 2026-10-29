import { Avatar as BaseAvatar } from "@base-ui/react/avatar";
import { cn } from "@/lib/utils";

export function Avatar({
	name,
	src,
	className,
}: {
	name: string;
	src?: string;
	className?: string;
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
				"inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-n-3 text-11 font-medium text-n-11",
				className,
			)}
		>
			{src ? <BaseAvatar.Image src={src} alt="" className="size-full object-cover" /> : null}
			<BaseAvatar.Fallback>{initials}</BaseAvatar.Fallback>
		</BaseAvatar.Root>
	);
}
