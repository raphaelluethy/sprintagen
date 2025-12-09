"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { MessageWithParts } from "@/lib/opencode-utils";
import { MessageDisplay } from "./message-display";

interface ChatAreaProps {
	messages: MessageWithParts[];
	newMessage: string;
	onNewMessageChange: (value: string) => void;
	onSendMessage: () => void;
	isSending: boolean;
	error: string | null;
	hasSelectedSession: boolean;
}

export function ChatArea({
	messages,
	newMessage,
	onNewMessageChange,
	onSendMessage,
	isSending,
	error,
	hasSelectedSession,
}: ChatAreaProps) {
	if (!hasSelectedSession) {
		return (
			<main className="flex min-w-0 flex-1 flex-col">
				<div className="flex flex-1 flex-col items-center justify-center">
					<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60">
						<svg
							aria-hidden="true"
							className="h-6 w-6 text-muted-foreground"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
							/>
						</svg>
					</div>
					<h2 className="mb-1 font-medium text-foreground">Select a session</h2>
					<p className="text-muted-foreground text-sm">
						Choose an existing session or create a new one
					</p>
				</div>
			</main>
		);
	}

	return (
		<main className="flex min-w-0 flex-1 flex-col">
			{error && (
				<div className="border-destructive/20 border-b bg-destructive/10 px-6 py-3">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			)}

			{/* Messages Area */}
			<ScrollArea className="flex-1">
				<div className="mx-auto max-w-3xl p-6">
					{messages.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center py-20">
							<div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/60">
								<svg
									aria-hidden="true"
									className="h-6 w-6 text-muted-foreground"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
									/>
								</svg>
							</div>
							<p className="text-muted-foreground text-sm">No messages yet</p>
							<p className="text-muted-foreground/60 text-xs">
								Send a message to start the conversation
							</p>
						</div>
					) : (
						<div className="space-y-4">
							{messages.map((message, index) => (
								<MessageDisplay
									key={message.info.id || `msg-${index}`}
									message={message}
								/>
							))}
						</div>
					)}
				</div>
			</ScrollArea>

			{/* Message Input */}
			<div className="border-border/40 border-t bg-card/30 p-4">
				<div className="mx-auto max-w-3xl">
					<div className="flex gap-3">
						<Textarea
							className="min-h-[44px] flex-1 resize-none text-sm"
							onChange={(e) => onNewMessageChange(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									onSendMessage();
								}
							}}
							placeholder="Type your message..."
							rows={1}
							value={newMessage}
						/>
						<Button
							className="h-auto px-4"
							disabled={!newMessage.trim() || isSending}
							onClick={onSendMessage}
						>
							{isSending ? (
								<svg
									aria-hidden="true"
									className="h-4 w-4 animate-spin"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										className="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
									/>
									<path
										className="opacity-75"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										fill="currentColor"
									/>
								</svg>
							) : (
								<svg
									aria-hidden="true"
									className="h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
							)}
						</Button>
					</div>
				</div>
			</div>
		</main>
	);
}
