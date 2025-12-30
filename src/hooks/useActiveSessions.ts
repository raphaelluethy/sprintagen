import { useCallback, useEffect, useState } from "react";
import { api } from "@/trpc/react";

function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}

function mapsAreEqual<K, V>(a: Map<K, V>, b: Map<K, V>): boolean {
	if (a.size !== b.size) return false;
	for (const [key, value] of a) {
		if (b.get(key) !== value) return false;
	}
	return true;
}

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
	const [pendingAskTicketIds, setPendingAskTicketIds] = useState<Set<string>>(
		new Set(),
	);

	const [pendingSessionMap, setPendingSessionMap] = useState<
		Map<string, string>
	>(new Map());

	const pendingInquiriesQuery = api.ticket.getPendingOpencodeInquiries.useQuery(
		undefined,
		{
			refetchInterval: 5000,
			refetchOnWindowFocus: false,
		},
	);

	useEffect(() => {
		if (pendingInquiriesQuery.data) {
			const data = pendingInquiriesQuery.data as unknown as PendingInquiry[];
			const newPendingIds = new Set(data.map((p) => p.ticketId));
			const newSessionMap = new Map(data.map((p) => [p.ticketId, p.sessionId]));

			setPendingAskTicketIds((prev) => {
				if (setsAreEqual(prev, newPendingIds)) {
					return prev;
				}
				return newPendingIds;
			});

			setPendingSessionMap((prev) => {
				if (mapsAreEqual(prev, newSessionMap)) {
					return prev;
				}
				return newSessionMap;
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
