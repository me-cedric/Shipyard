import type { HTMLAttributes } from "react";

interface SidebarIconProps extends HTMLAttributes<HTMLDivElement> {
	size?: number;
}

/** A window with its left panel: the sidebar toggle. Not the columns of the Work space. */
export function SidebarIcon({ size = 28, ...props }: SidebarIconProps) {
	return (
		<div {...props}>
			<svg
				aria-hidden="true"
				fill="none"
				height={size}
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
				viewBox="0 0 24 24"
				width={size}
				xmlns="http://www.w3.org/2000/svg"
			>
				<rect height="15" rx="1.5" width="18" x="3" y="4.5" />
				<path d="M9 4.5v15" />
				<path d="M5.25 7.5h1.5M5.25 10h1.5M5.25 12.5h1.5" />
			</svg>
		</div>
	);
}
