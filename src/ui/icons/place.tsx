import type { ReactNode } from "react";

/** The icons of the rail, as the design draws them (class `.ic`: a 24 px grid and a 1.8 px stroke). */
function Ic({ size = 20, children }: { size?: number; children: ReactNode }) {
	return (
		<svg
			aria-hidden="true"
			fill="none"
			height={size}
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.8"
			viewBox="0 0 24 24"
			width={size}
			xmlns="http://www.w3.org/2000/svg"
		>
			{children}
		</svg>
	);
}

type Props = { size?: number };

export const TodayIcon = ({ size }: Props) => (
	<Ic size={size}>
		<circle cx="12" cy="12" r="9" />
		<path d="M8 12.5l2.5 2.5L16 9.5" />
	</Ic>
);

export const FlowIcon = ({ size }: Props) => (
	<Ic size={size}>
		<path d="M4 6h6v12H4zM14 6h6v7h-6z" />
	</Ic>
);

export const PlanIcon = ({ size }: Props) => (
	<Ic size={size}>
		<rect x="4" y="5" width="16" height="15" rx="3" />
		<path d="M4 10h16M9 3v4M15 3v4" />
	</Ic>
);

export const CrewIcon = ({ size }: Props) => (
	<Ic size={size}>
		<circle cx="9" cy="9" r="3.5" />
		<path d="M3 19c.6-3 3-4.5 6-4.5s5.4 1.5 6 4.5M16 6a3 3 0 010 6M18 14.8c1.6.6 2.6 2 3 4.2" />
	</Ic>
);

export const LibraryIcon = ({ size }: Props) => (
	<Ic size={size}>
		<path d="M5 4h9a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h9" />
	</Ic>
);

export const CodeIcon = ({ size }: Props) => (
	<Ic size={size}>
		<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
	</Ic>
);

export const SetupIcon = ({ size }: Props) => (
	<Ic size={size}>
		<circle cx="12" cy="12" r="3" />
		<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
	</Ic>
);
