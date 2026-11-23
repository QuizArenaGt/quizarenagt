import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Room } from '../models/room';
import {
    executeLoadOverviewAnalytics,
    type RoomOverviewDashboardEntry,
} from '../models/roomReport';
import {
    listRoomGamesWithStatsApi,
    type ApiRoomAggregatedStats,
} from '../services/roomStorageService';

/*
 * VIEWMODEL da aba global Visão Geral:
 *
 * Carrega e expõe exclusivamente os dashboards analíticos das salas que possuem
 * pelo menos uma partida finalizada (`finishedGamesCount > 0`), usando os dados
 * agregados persistidos pelo backend sem depender de cache em memória.
 */
export function useOverviewViewModel(
    rooms: Room[],
    activeRoomStats: ApiRoomAggregatedStats | null = null,
    isLoadingHostRooms = false,
) {
    const [entries, setEntries] = useState<RoomOverviewDashboardEntry[]>([]);
    const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestSeqRef = useRef(0);
    const roomsRef = useRef<Room[]>(rooms);
    const cacheRef = useRef<Map<string, ApiRoomAggregatedStats>>(new Map());

    const playedRoomsSignature = useMemo(
        () =>
            rooms
                .filter((room) => (room.finishedGamesCount ?? 0) > 0)
                .map(
                    (room) =>
                        `${room.id}:${room.name}:${room.theme}:${room.finishedGamesCount ?? 0}:${room.lastGameFinishedAt ?? ''}`,
                )
                .join('|'),
        [rooms],
    );

    useEffect(() => {
        roomsRef.current = rooms;
    }, [rooms]);

    useEffect(() => {
        if (!activeRoomStats) return;
        cacheRef.current.set(activeRoomStats.roomId, activeRoomStats);
    }, [activeRoomStats]);

    const loadOverviewAnalytics = useCallback(async (forceFresh = false) => {
        if (forceFresh) {
            cacheRef.current.clear();
        }
        return executeLoadOverviewAnalytics({
            rooms: roomsRef.current,
            requestSeqRef,
            fetchRoomGamesWithStats: listRoomGamesWithStatsApi,
            cachedStatsByRoomId: forceFresh ? undefined : cacheRef.current,
            onLoadingChange: setIsLoadingAnalytics,
            onError: setError,
            onSuccess: (loaded) => {
                for (const item of loaded) {
                    cacheRef.current.set(item.room.id, item.stats);
                }
                setEntries(loaded);
            },
        });
    }, []);

    useEffect(() => {
        let active = true;

        async function syncAnalytics() {
            await Promise.resolve();
            if (!active) return;
            if (!playedRoomsSignature) {
                cacheRef.current.clear();
            }
            await loadOverviewAnalytics(false);
        }

        void syncAnalytics();

        return () => {
            active = false;
        };
    }, [playedRoomsSignature, loadOverviewAnalytics]);

    return {
        entries,
        hasData: entries.length > 0,
        isLoading: isLoadingHostRooms || isLoadingAnalytics,
        error,
        reload: () => loadOverviewAnalytics(true),
    };
}
