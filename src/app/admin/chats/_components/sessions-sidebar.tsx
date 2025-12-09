"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface Session {
	id: string;
	title?: string;
	createdAt?: string;
}

interface SessionsSidebarProps {
	sessions: Session[];
	selectedSessionId: string | null;
	onSelectSession: (id: string) => void;
	onCreateSession: () => void;
	isLoading: boolean;
	healthStatus: "checking" | "healthy" | "unhealthy";
}

function formatTimestamp(timestamp?: string): string {
	if (!timestamp) return "";
	try {
		return new Date(timestamp).toLocaleString();
	} catch {
		return timestamp;
	}
}

export function SessionsSidebar({
	sessions,
	selectedSessionId,
	onSelectSession,
	onCreateSession,
	isLoading,
	healthStatus,
}: SessionsSidebarProps) {
	return (
		<aside className="flex w-72 shrink-0 flex-col border-border/40 border-r bg-card/30">
			<div className="border-border/40 border-b p-4">
				<Button
					className="w-full"
					disabled={isLoading || healthStatus !== "healthy"}
					onClick={onCreateSession}
					size="sm"
				>
					New Session
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-2">
					{sessions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<p className="text-muted-foreground text-sm">No sessions yet</p>
							<p className="text-muted-foreground/60 text-xs">
								Create one to get started
							</p>
						</div>
					) : (
						<div className="space-y-1">
							{sessions.map((session) => (
								<button
									className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
										selectedSessionId === session.id
											? "bg-secondary text-foreground"
											: "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
									}`}
									key={session.id}
									onClick={() => onSelectSession(session.id)}
									type="button"
								>
									<span className="block truncate text-sm">
										{session.title || `Session ${session.id.slice(0, 8)}`}
									</span>
									{session.createdAt && (
										<span className="mt-0.5 block text-[11px] opacity-60">
											{formatTimestamp(session.createdAt)}
										</span>
									)}
								</button>
							))}
						</div>
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}
