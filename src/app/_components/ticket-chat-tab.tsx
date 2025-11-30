"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ticketMessages } from "@/server/db/schema";
import { api } from "@/trpc/react";

type TicketMessage = typeof ticketMessages.$inferSelect;

interface TicketChatTabProps {
	ticketId: string;
	messages: TicketMessage[];
	replyingToInsight: { insight: string; date: Date } | null;
	onReplyingToInsightChange: (
		insight: { insight: string; date: Date } | null,
	) => void;
	onTicketRefetch: () => void;
}

export function TicketChatTab({
	ticketId,
	messages,
	replyingToInsight,
	onReplyingToInsightChange,
	onTicketRefetch,
}: TicketChatTabProps) {
	const [chatInput, setChatInput] = useState("");
	const chatEndRef = useRef<HTMLDivElement>(null);

	const chatMutation = api.ticket.chat.useMutation({
		onSuccess: () => {
			setChatInput("");
			onTicketRefetch();
		},
	});

	const clearChatMutation = api.ticket.clearChat.useMutation({
		onSuccess: () => {
			onTicketRefetch();
		},
	});

	// Scroll to bottom when messages change
	useEffect(() => {
		if (messages.length > 0) {
			chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages.length]);

	const handleSendMessage = () => {
		if (!chatInput.trim() || !ticketId) return;

		let messageToSend = chatInput.trim();
		if (replyingToInsight) {
			messageToSend = `Context (Insight from ${replyingToInsight.date.toLocaleString()}):\n> ${replyingToInsight.insight.replace(/\n/g, "\n> ")}\n\n${messageToSend}`;
			onReplyingToInsightChange(null);
		}

		chatMutation.mutate({
			ticketId,
			message: messageToSend,
		});
	};

	return (
		<TabsContent
			className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
			value="chat"
		>
			<div className="flex min-h-0 flex-1 flex-col px-6 py-4">
				{/* Chat messages */}
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-3 pr-4">
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-12 text-center">
								<p className="text-muted-foreground text-sm">No messages yet</p>
								<p className="text-muted-foreground/60 text-xs">
									Start a conversation about this ticket
								</p>
							</div>
						) : (
							messages.map((msg) => (
								<div
									className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
									key={msg.id}
								>
									<div
										className={`max-w-[80%] overflow-hidden rounded-lg px-4 py-2.5 ${
											msg.role === "user"
												? "bg-foreground text-background"
												: "bg-card/50"
										}`}
									>
										<div className="prose prose-sm prose-invert prose-ol:my-1 prose-p:my-1 prose-pre:my-1 prose-ul:my-1 max-w-none overflow-x-auto prose-pre:overflow-x-auto prose-code:rounded prose-code:bg-background/10 prose-code:px-1 prose-code:py-0.5 text-inherit prose-code:before:content-none prose-code:after:content-none">
											<Markdown>{msg.content}</Markdown>
										</div>
										<p className="mt-1 text-xs tabular-nums opacity-50">
											{new Date(msg.createdAt).toLocaleTimeString()}
										</p>
									</div>
								</div>
							))
						)}
						{chatMutation.isPending && (
							<div className="flex justify-start">
								<div className="rounded-lg border border-border/60 bg-card/50 px-4 py-2.5">
									<div className="flex items-center gap-1.5">
										<div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
										<div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.1s]" />
										<div className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0.2s]" />
									</div>
								</div>
							</div>
						)}
						<div ref={chatEndRef} />
					</div>
				</ScrollArea>

				{/* Chat input */}
				<div className="mt-4 space-y-2">
					{replyingToInsight && (
						<div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2">
							<span className="text-primary text-xs">
								Discussing Insight from{" "}
								{replyingToInsight.date.toLocaleString()}
							</span>
							<Button
								className="h-auto p-0 text-muted-foreground hover:text-foreground"
								onClick={() => onReplyingToInsightChange(null)}
								size="sm"
								variant="ghost"
							>
								<svg
									aria-hidden="true"
									className="h-4 w-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M6 18L18 6M6 6l12 12"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
							</Button>
						</div>
					)}
					<div className="flex gap-2">
						<Textarea
							className="min-h-11 resize-none text-sm"
							disabled={chatMutation.isPending}
							onChange={(e) => setChatInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSendMessage();
								}
							}}
							placeholder="Ask about this ticket..."
							value={chatInput}
						/>
						<Button
							className="h-auto px-4"
							disabled={!chatInput.trim() || chatMutation.isPending}
							onClick={handleSendMessage}
						>
							Send
						</Button>
					</div>
					{messages.length > 0 && (
						<Button
							className="h-7 text-xs"
							disabled={clearChatMutation.isPending}
							onClick={() => clearChatMutation.mutate({ ticketId })}
							size="sm"
							variant="ghost"
						>
							Clear chat history
						</Button>
					)}
				</div>
			</div>
		</TabsContent>
	);
}
