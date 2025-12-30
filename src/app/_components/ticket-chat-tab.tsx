"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
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
	const lastMessageIdRef = useRef<string | null>(null);

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

	useEffect(() => {
		const lastMessage = messages[messages.length - 1];
		if (lastMessage && lastMessage.id !== lastMessageIdRef.current) {
			lastMessageIdRef.current = lastMessage.id;
			chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages]);

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
			<div className="flex min-h-0 flex-1 flex-col">
				{/* Chat messages area */}
				<ScrollArea className="min-h-0 flex-1 px-6">
					<div className="space-y-4 py-5">
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 text-center">
								<div className="rounded-full bg-muted/30 p-4">
									<svg
										className="h-10 w-10 text-muted-foreground/40"
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
								<p className="mt-4 font-medium text-foreground text-sm">
									No messages yet
								</p>
								<p className="mt-1 text-muted-foreground text-xs">
									Start a conversation about this ticket
								</p>
							</div>
						) : (
							messages.map((msg, index) => {
								const isUser = msg.role === "user";
								const showAvatar =
									index === 0 || messages[index - 1]?.role !== msg.role;

								return (
									<div
										className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
										key={msg.id}
									>
										{/* Avatar */}
										{showAvatar && (
											<div
												className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
													isUser
														? "bg-primary text-primary-foreground"
														: "bg-muted/50 text-muted-foreground"
												}`}
											>
												{isUser ? (
													<svg
														className="h-4 w-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
														/>
													</svg>
												) : (
													<svg
														className="h-4 w-4"
														fill="none"
														stroke="currentColor"
														viewBox="0 0 24 24"
													>
														<path
															d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
															strokeLinecap="round"
															strokeLinejoin="round"
															strokeWidth={2}
														/>
													</svg>
												)}
											</div>
										)}
										{!showAvatar && <div className="w-8 shrink-0" />}

										{/* Message bubble */}
										<div
											className={`group relative max-w-[75%] ${isUser ? "text-right" : ""}`}
										>
											<div
												className={`overflow-hidden rounded-2xl px-4 py-3 ${
													isUser
														? "rounded-tr-sm bg-primary text-primary-foreground"
														: "rounded-tl-sm border border-border/30 bg-card/50"
												}`}
											>
												<div
													className={`prose prose-sm max-w-none prose-p:my-1 prose-ol:my-1 prose-ul:my-1 prose-pre:my-2 overflow-x-auto prose-pre:overflow-x-auto prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none ${
														isUser
															? "prose-invert text-primary-foreground prose-code:bg-primary-foreground/20 prose-code:text-primary-foreground prose-strong:text-primary-foreground"
															: "prose-invert prose-code:bg-muted prose-code:text-foreground prose-p:text-muted-foreground"
													}`}
												>
													<Markdown rehypePlugins={[rehypeSanitize]}>
														{msg.content}
													</Markdown>
												</div>
											</div>
											<p
												className={`mt-1 text-[10px] tabular-nums text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 ${
													isUser ? "text-right" : ""
												}`}
											>
												{new Date(msg.createdAt).toLocaleTimeString(undefined, {
													hour: "numeric",
													minute: "2-digit",
												})}
											</p>
										</div>
									</div>
								);
							})
						)}

						{/* Typing indicator */}
						{chatMutation.isPending && (
							<div className="flex gap-3">
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
									<svg
										className="h-4 w-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
								</div>
								<div className="rounded-2xl rounded-tl-sm border border-border/30 bg-card/50 px-4 py-3">
									<div className="flex items-center gap-1">
										<div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
										<div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0.15s]" />
										<div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0.3s]" />
									</div>
								</div>
							</div>
						)}
						<div ref={chatEndRef} />
					</div>
				</ScrollArea>

				{/* Input area with improved styling */}
				<div className="shrink-0 border-border/30 border-t bg-muted/10 px-6 py-4">
					{/* Context indicator */}
					{replyingToInsight && (
						<div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2">
							<div className="flex items-center gap-2 text-violet-400">
								<svg
									className="h-4 w-4 shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
								<span className="text-xs font-medium">
									Replying to insight from{" "}
									{replyingToInsight.date.toLocaleString(undefined, {
										month: "short",
										day: "numeric",
										hour: "numeric",
										minute: "2-digit",
									})}
								</span>
							</div>
							<Button
								className="h-6 w-6 p-0 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
								onClick={() => onReplyingToInsightChange(null)}
								size="sm"
								variant="ghost"
							>
								<svg
									className="h-3.5 w-3.5"
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

					{/* Input row */}
					<div className="flex gap-2">
						<div className="relative flex-1">
							<Textarea
								className="min-h-[44px] resize-none rounded-xl border-border/30 bg-card/50 pr-12 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
								disabled={chatMutation.isPending}
								onChange={(e) => setChatInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										handleSendMessage();
									}
								}}
								placeholder="Ask about this ticket..."
								rows={1}
								value={chatInput}
							/>
						</div>
						<Button
							className="h-11 w-11 shrink-0 rounded-xl p-0"
							disabled={!chatInput.trim() || chatMutation.isPending}
							onClick={handleSendMessage}
							size="icon"
						>
							<svg
								className="h-5 w-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M12 19V5m0 0l-7 7m7-7l7 7"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
						</Button>
					</div>

					{/* Actions row */}
					<div className="mt-2 flex items-center justify-between">
						<p className="text-muted-foreground/60 text-[10px]">
							Press Enter to send, Shift+Enter for new line
						</p>
						{messages.length > 0 && (
							<Button
								className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-destructive"
								disabled={clearChatMutation.isPending}
								onClick={() => clearChatMutation.mutate({ ticketId })}
								size="sm"
								variant="ghost"
							>
								<svg
									className="h-3 w-3"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
								Clear history
							</Button>
						)}
					</div>
				</div>
			</div>
		</TabsContent>
	);
}
