import { normalizeRoomCode } from '../models/game';
import {
    getRoomLobbyApi,
    joinRoomApi,
    submitRoundAnswerApi,
    type ApiRoomLobby,
    type JoinRoomApiResponse,
    type SubmitAnswerApiResponse,
} from './roomStorageService';

export interface JoinedRoomSession {
    player: JoinRoomApiResponse['player'];
    sessionToken: string;
    lobby: ApiRoomLobby;
}

export async function joinRoomWithNickname(
    code: string,
    nickname: string,
): Promise<JoinedRoomSession> {
    const cleanCode = normalizeRoomCode(code);
    const cleanNickname = nickname.trim();

    const joinResult = await joinRoomApi({
        code: cleanCode,
        nickname: cleanNickname,
    });

    const lobby = await getRoomLobbyApi(cleanCode, joinResult.sessionToken);

    return {
        player: joinResult.player,
        sessionToken: joinResult.sessionToken,
        lobby,
    };
}

export async function fetchPlayerLobby(
    code: string,
    sessionToken: string,
): Promise<ApiRoomLobby> {
    return getRoomLobbyApi(code, sessionToken);
}

export async function submitPlayerRoundAnswer(
    roundId: string,
    optionId: string,
    sessionToken: string,
): Promise<SubmitAnswerApiResponse> {
    return submitRoundAnswerApi(roundId, optionId, sessionToken);
}
