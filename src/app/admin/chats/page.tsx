"use client";

import { env } from "@/env";
import { ChatArea } from "./_components/chat-area";
import { ChatHeader } from "./_components/chat-header";
import { SessionsSidebar } from "./_components/sessions-sidebar";
import { useChatSession } from "./_hooks/use-chat-session";

export default function AdminChatsPage() {
	// Derive provider/model based on FAST_MODE
	const fastMode = env.NEXT_PUBLIC_FAST_MODE;
	const modelConfig = fastMode
		? { providerID: "cerebras", modelID: "zai-glm-4.6" }
		: { providerID: "opencode", modelID: "minimax-m2.1-free" };

	const {
		sessions,
		selectedSessionId,
		setSelectedSessionId,
		messages,
		isLoading,
		isSending,
		error,
		healthStatus,
		authStatus,
		newMessage,
		setNewMessage,
		createSession,
		sendMessage,
	} = useChatSession({ modelConfig });

	return (
		<div className="flex h-screen flex-col bg-background">
			<ChatHeader
				authStatus={authStatus}
				fastMode={fastMode}
				healthStatus={healthStatus}
				modelConfig={modelConfig}
			/>

			<div className="flex min-h-0 flex-1">
				<SessionsSidebar
					healthStatus={healthStatus}
					isLoading={isLoading}
					onCreateSession={createSession}
					onSelectSession={setSelectedSessionId}
					selectedSessionId={selectedSessionId}
					sessions={sessions}
				/>

				<ChatArea
					error={error}
					hasSelectedSession={!!selectedSessionId}
					isSending={isSending}
					messages={messages}
					newMessage={newMessage}
					onNewMessageChange={setNewMessage}
					onSendMessage={sendMessage}
				/>
			</div>
		</div>
	);
}
