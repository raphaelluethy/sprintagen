import { useCallback, useEffect, useState } from "react";
import { api } from "@/trpc/react";

interface PendingInquiry {
	ticketId: string;
	sessionId: string;
	sessionType: "chat" | "ask" | "admin";
	status: "pending" | "running";
	startedAt: number;
}

interface UseActiveSessionsResult {
	/** Set of ticket IDs with pending Ask Opencode runs */
	pendingAskTicketIds: Set<string>;
	/** Check if a specific ticket has a pending Ask Opencode run */
	isAskOpencodePending: (ticketId: string) => boolean;
	/** Get the session ID for a pending ticket (for SSE connection) */
	getPendingSessionId: (ticketId: string) => string | null;
	/** Mark a ticket as pending immediately (for optimistic UI updates) */
	markTicketPending: (ticketId: string) => void;
	/** Set the session ID for a pending ticket (called when mutation succeeds) */
	setSessionId: (ticketId: string, sessionId: string) => void;
	/** Add a new pending session with sessionId (convenience method) */
	addPendingSession: (ticketId: string, sessionId: string) => void;
	/** Clear a pending session (used when we detect completion client-side) */
	clearTicketPending: (ticketId: string) => void;
	/** Whether we're still loading the initial session state */
	isRestoring: boolean;
	/** Refetch pending sessions from the backend */
	refetch: () => Promise<void>;
	/** Raw pending inquiries data */
	pendingInquiries: PendingInquiry[];
}

/**
 * Hook for tracking pending OpenCode sessions in the UI.
 */
export function useActiveSessions(): UseActiveSessionsResult {
	// Track tickets with pending Ask Opencode runs
	const [pendingAskTicketIds, setPendingAskTicketIds] = useState<Set<string>>(
		new Set(),
	);

	// Map of ticketId -> sessionId for pending inquiries (for SSE connection)
	const [pendingSessionMap, setPendingSessionMap] = useState<
		Map<string, string>
	>(new Map());

	// Query for pending opencode inquiries (restores state on page load)
	const pendingInquiriesQuery = api.ticket.getPendingOpencodeInquiries.useQuery(
		undefined,
		{
			// Refetch periodically to catch completed sessions
			refetchInterval: 5000,
			// Don't refetch on window focus to avoid UI flicker
			refetchOnWindowFocus: false,
		},
	);

	// Populate pending tickets state from server data
	useEffect(() => {
		if (pendingInquiriesQuery.data) {
			const data = pendingInquiriesQuery.data as unknown as PendingInquiry[];
			const newPendingIds = new Set(data.map((p) => p.ticketId));
			const newSessionMap = new Map(data.map((p) => [p.ticketId, p.sessionId]));

			// Only update if changed to prevent unnecessary re-renders
			setPendingAskTicketIds((prev) => {
				const prevArray = Array.from(prev).sort();
				const newArray = Array.from(newPendingIds).sort();
				if (JSON.stringify(prevArray) !== JSON.stringify(newArray)) {
					return newPendingIds;
				}
				return prev;
			});

			setPendingSessionMap((prev) => {
				// Compare maps by converting to sorted arrays
				const prevEntries = JSON.stringify(
					Array.from(prev.entries()).sort(([a], [b]) => a.localeCompare(b)),
				);
				const newEntries = JSON.stringify(
					Array.from(newSessionMap.entries()).sort(([a], [b]) =>
						a.localeCompare(b),
					),
				);
				if (prevEntries !== newEntries) {
					return newSessionMap;
				}
				return prev;
			});
		}
	}, [pendingInquiriesQuery.data]);

	const isAskOpencodePending = useCallback(
		(ticketId: string) => pendingAskTicketIds.has(ticketId),
		[pendingAskTicketIds],
	);

	const getPendingSessionId = useCallback(
		(ticketId: string) => pendingSessionMap.get(ticketId) ?? null,
		[pendingSessionMap],
	);

	const markTicketPending = useCallback((ticketId: string) => {
		setPendingAskTicketIds((prev) => new Set([...prev, ticketId]));
	}, []);

	const setSessionId = useCallback((ticketId: string, sessionId: string) => {
		setPendingSessionMap((prev) => {
			const next = new Map(prev);
			next.set(ticketId, sessionId);
			return next;
		});
	}, []);

	const addPendingSession = useCallback(
		(ticketId: string, sessionId: string) => {
			markTicketPending(ticketId);
			setSessionId(ticketId, sessionId);
		},
		[markTicketPending, setSessionId],
	);

	const clearTicketPending = useCallback((ticketId: string) => {
		setPendingAskTicketIds((prev) => {
			if (!prev.has(ticketId)) return prev;
			const next = new Set(prev);
			next.delete(ticketId);
			return next;
		});
		setPendingSessionMap((prev) => {
			if (!prev.has(ticketId)) return prev;
			const next = new Map(prev);
			next.delete(ticketId);
			return next;
		});
	}, []);

	// Refetch pending sessions
	const refetch = useCallback(async () => {
		await pendingInquiriesQuery.refetch();
	}, [pendingInquiriesQuery]);

	return {
		pendingAskTicketIds,
		isAskOpencodePending,
		getPendingSessionId,
		markTicketPending,
		setSessionId,
		addPendingSession,
		clearTicketPending,
		isRestoring: pendingInquiriesQuery.isLoading,
		refetch,
		pendingInquiries: (pendingInquiriesQuery.data ?? []) as PendingInquiry[],
	};
}
