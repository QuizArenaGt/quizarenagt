import { resolvePlayerAvatarId } from '../models/avatars.ts';
import { normalizeRoomCode } from '../models/game.ts';
import {
    checkRoomAvailabilityApi,
    getRoomLobbyApi,
    joinRoomApi,
    leaveRoomApi,
    submitRoundAnswerApi,
    type ApiRoomAvailability,
    type ApiRoomLobby,
    type JoinRoomApiResponse,
    type LeaveRoomApiResponse,
    type SubmitAnswerApiResponse,
} from './roomStorageService.ts';

export interface JoinedRoomSession {
    player: JoinRoomApiResponse['player'];
    sessionToken: string;
    lobby: ApiRoomLobby;
}

export async function verifyRoomAvailability(
    code: string,
): Promise<ApiRoomAvailability> {
    const cleanCode = normalizeRoomCode(code);
    return checkRoomAvailabilityApi(cleanCode);
}

export async function joinRoomWithNickname(
    code: string,
    nickname: string,
    avatarId?: string,
): Promise<JoinedRoomSession> {
    const cleanCode = normalizeRoomCode(code);
    const cleanNickname = nickname.trim();

    const joinResult = await joinRoomApi({
        code: cleanCode,
        nickname: cleanNickname,
        avatarId: resolvePlayerAvatarId(avatarId),
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

export async function leaveRoomSession(
    sessionToken: string,
): Promise<LeaveRoomApiResponse> {
    return leaveRoomApi(sessionToken);
}
