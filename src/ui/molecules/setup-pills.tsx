import { useRouter } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type Pill = { id: string; label: string; href: string; current?: boolean };

/** The sub-pages of a Setup scope as a row of pills. Each pill is a link; the one of the open page is blue. */
export function SetupPills({ label, items }: { label: string; items: Pill[] }) {
	const router = useRouter();
	return (
		<nav aria-label={label} className="px-4 pb-6">
			<ul className="flex flex-wrap gap-2">
				{items.map((p) => (
					<li key={p.id}>
						<a
							href={p.href}
							aria-current={p.current ? "page" : undefined}
							onClick={(e) => {
								e.preventDefault();
								router.history.push(p.href);
							}}
							className={cn(
								"inline-flex min-h-control items-center rounded-sm px-3.5 font-medium transition-colors duration-(--duration-fast)",
								p.current ? "bg-accent text-accent-fg" : "bg-surface-1 text-n-12 hover:bg-n-3",
							)}
						>
							{p.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
