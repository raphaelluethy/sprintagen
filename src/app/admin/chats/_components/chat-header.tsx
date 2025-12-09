"use client";

import { ThemeToggle } from "@/components/ui/theme-toggle";

interface ChatHeaderProps {
	healthStatus: "checking" | "healthy" | "unhealthy";
	authStatus: string | null;
	fastMode: boolean;
	modelConfig: {
		providerID: string;
		modelID: string;
	};
}

export function ChatHeader({
	healthStatus,
	authStatus,
	fastMode,
	modelConfig,
}: ChatHeaderProps) {
	return (
		<header className="flex h-14 shrink-0 items-center justify-between border-border/40 border-b px-6">
			<div className="flex items-center gap-4">
				<a
					className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
					href="/"
				>
					<svg
						aria-hidden="true"
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							d="M15 19l-7-7 7-7"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
						/>
					</svg>
					<span className="text-sm">Back</span>
				</a>
				<div className="h-4 w-px bg-border" />
				<h1 className="font-medium text-sm">Opencode Chat</h1>
			</div>
			<div className="flex items-center gap-4">
				{authStatus && (
					<span className="text-muted-foreground text-xs">{authStatus}</span>
				)}
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-xs">
						Fast mode: {fastMode ? "ON" : "OFF"} • Model:{" "}
						{modelConfig.providerID}/{modelConfig.modelID}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<div
						className={`h-2 w-2 rounded-full ${
							healthStatus === "healthy"
								? "bg-foreground"
								: healthStatus === "unhealthy"
									? "bg-destructive"
									: "animate-pulse bg-muted-foreground"
						}`}
					/>
					<span className="text-muted-foreground text-xs">
						{healthStatus === "checking"
							? "Connecting..."
							: healthStatus === "healthy"
								? "Connected"
								: "Disconnected"}
					</span>
				</div>
				<ThemeToggle />
			</div>
		</header>
	);
}
