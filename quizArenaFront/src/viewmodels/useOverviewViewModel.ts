import { useMemo } from 'react';
import type { Question } from '../models/question';
import { buildOverviewStats } from '../models/roomReport';
import type { Room } from '../models/room';
import { loadAllRoomResults } from '../services/roomResultsService';

/*
 * VIEWMODEL das estatísticas da Visão Geral do painel.
 *
 * Junta as salas (useRoomsViewModel) com os resultados registrados e
 * entrega os números já calculados pelo Model (buildOverviewStats).
 * Os resultados são lidos quando a aba é aberta, pois podem ter mudado
 * enquanto os alunos jogavam em outra aba.
 */
export function useOverviewViewModel(rooms: Room[], questionBank: Question[]) {
    const stats = useMemo(() => {
        const resultsByRoom = loadAllRoomResults();
        return buildOverviewStats(
            rooms.map((room) => ({
                id: room.id,
                name: room.name,
                isFinished: room.status === 'Finalizado',
                results: resultsByRoom[room.id] ?? null,
            })),
            questionBank,
        );
    }, [rooms, questionBank]);

    return { stats, hasData: stats.quizzesPlayed > 0 };
}
