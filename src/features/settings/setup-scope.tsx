import { useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { ChevronLeftIcon, Cog6ToothIcon, ComputerDesktopIcon, UserCircleIcon } from "@/ui/icons";
import { Door } from "@/ui/molecules/door";
import { PageHeader } from "@/ui/molecules/page-header";

/** The icon of each scope: the one of its section (`tabIcon`). */
const ICON = { project: Cog6ToothIcon, computer: ComputerDesktopIcon, me: UserCircleIcon };

export type ScopePage = {
	id: string;
	label: string;
	icon: ReactNode;
	view: ReactNode;
	/** The view has no page header of its own: the scope draws one, so the page has its level-one heading. */
	bare?: boolean;
};

/**
 * One scope of Setup (`spec:app-redesign#REQ-024`): a door for each sub-page, then the settings of
 * the scope. The address `?page=<id>` shows the sub-page in place of the scope, with a back link.
 */
export function SetupScope({
	scope,
	pages,
	count,
	children,
}: {
	scope: "project" | "computer" | "me";
	pages: ScopePage[];
	/** The count of the page header. */
	count?: number;
	children: ReactNode;
}) {
	const { t } = useI18n();
	const router = useRouter();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const id = useRouterState({
		select: (s) => new URLSearchParams(s.location.searchStr).get("page"),
	});
	const name = t.settings.scope[scope];
	const page = pages.find((p) => p.id === id);
	const Icon = ICON[scope];
	if (page)
		return (
			<div className="flex flex-col">
				<div className="px-4 pt-3">
					<Button
						variant="ghost"
						className="min-h-control"
						onClick={() => router.history.push(pathname)}
					>
						<ChevronLeftIcon size={14} />
						{name}
					</Button>
				</div>
				{page.bare ? <PageHeader title={page.label} /> : null}
				{page.view}
			</div>
		);
	return (
		<div className="flex flex-col">
			{/* Each page has one level-one heading (ux-declutter REQ-017). */}
			<PageHeader icon={<Icon size={16} />} title={name} count={count} />
			<nav aria-label={name} className="px-4 pt-3 pb-2">
				<ul className="grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
					{pages.map((p) => {
						const href = `${pathname}?page=${p.id}`;
						return (
							<li key={p.id}>
								<Door
									label={p.label}
									icon={p.icon}
									render={(door) => (
										<a
											href={href}
											onClick={(e) => {
												e.preventDefault();
												router.history.push(href);
											}}
											{...door}
										/>
									)}
								/>
							</li>
						);
					})}
				</ul>
			</nav>
			{children}
		</div>
	);
}
