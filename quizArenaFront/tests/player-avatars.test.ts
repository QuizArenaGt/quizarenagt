import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
    DEFAULT_PLAYER_AVATAR_ID,
    getAvatarMeta,
    isValidPlayerAvatarId,
    PLAYER_AVATAR_IDS,
    PLAYER_AVATARS,
    resolvePlayerAvatarId,
} from '../src/models/avatars.ts';
import { buildRoomReportFromServerGame } from '../src/models/roomReport.ts';
import { joinRoomWithNickname } from '../src/services/gameRoomService.ts';
import {
    loadPlayerSession,
    PLAYER_SESSION_STORAGE_KEY,
    savePlayerSession,
} from '../src/services/playerSessionStorage.ts';

function readFrontFile(relativePath: string): string {
    return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function createMemoryStorage() {
    const store = new Map<string, string>();
    return {
        store,
        adapter: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => {
                store.set(key, value);
            },
            removeItem: (key: string) => {
                store.delete(key);
            },
        },
    };
}

describe('Sistema de avatares dos jogadores', () => {
    it('1. catálogo possui exatamente 17 avatares únicos, coesos e default "explorer"', () => {
        assert.equal(PLAYER_AVATAR_IDS.length, 17);
        assert.equal(PLAYER_AVATARS.length, 17);
        assert.equal(DEFAULT_PLAYER_AVATAR_ID, 'explorer');
        assert.equal(new Set(PLAYER_AVATAR_IDS).size, 17);
        assert.equal(new Set(PLAYER_AVATARS.map((a) => a.name)).size, 17);
        assert.ok(PLAYER_AVATAR_IDS.includes('rockstar'));

        for (const avatar of PLAYER_AVATARS) {
            assert.ok(isValidPlayerAvatarId(avatar.id));
            assert.ok(avatar.name.trim().length > 0);
            assert.ok(avatar.description.trim().length > 0);
            assert.match(avatar.bgFrom, /^#[0-9A-F]{6}$/i);
            assert.match(avatar.bgTo, /^#[0-9A-F]{6}$/i);
            assert.match(avatar.ringColor, /^#[0-9A-F]{6}$/i);
        }
    });

    it('2. resolvePlayerAvatarId aplica fallback seguro para valores ausentes, legados ou maliciosos', () => {
        assert.equal(resolvePlayerAvatarId('fox'), 'fox');
        assert.equal(resolvePlayerAvatarId(' robot '), 'robot');
        assert.equal(resolvePlayerAvatarId(undefined), 'explorer');
        assert.equal(resolvePlayerAvatarId(null), 'explorer');
        assert.equal(resolvePlayerAvatarId(''), 'explorer');
        assert.equal(resolvePlayerAvatarId('avatar-inexistente'), 'explorer');
        assert.equal(resolvePlayerAvatarId('https://evil.com/x.png'), 'explorer');
        assert.equal(resolvePlayerAvatarId('<svg><script>alert(1)</script></svg>'), 'explorer');
        assert.equal(getAvatarMeta('unknown').id, 'explorer');
    });

    it('3. sessionStorage persiste avatarId escolhido, mantém compatibilidade com sessão legada e sanitiza valor inválido', () => {
        const memory = createMemoryStorage();

        savePlayerSession(
            {
                sessionToken: 'tok-1',
                roomCode: 'abc123',
                roomId: 'room-1',
                gameId: 'game-1',
                playerId: 'p-1',
                nickname: 'Lucas',
                avatarId: 'fox',
            },
            memory.adapter,
        );

        const loaded = loadPlayerSession(memory.adapter);
        assert.equal(loaded?.avatarId, 'fox');

        memory.adapter.setItem(
            PLAYER_SESSION_STORAGE_KEY,
            JSON.stringify({
                sessionToken: 'tok-1',
                roomCode: 'ABC123',
                roomId: 'room-1',
                gameId: 'game-1',
                playerId: 'p-1',
                nickname: 'Lucas',
                avatarId: '<img src=x onerror=alert(1)>',
            }),
        );
        assert.equal(loadPlayerSession(memory.adapter)?.avatarId, 'explorer');

        memory.adapter.setItem(
            PLAYER_SESSION_STORAGE_KEY,
            JSON.stringify({
                sessionToken: 'tok-legacy',
                roomCode: 'ABC123',
                roomId: 'room-1',
                gameId: 'game-1',
                playerId: 'p-2',
                nickname: 'Legado',
            }),
        );
        const legacy = loadPlayerSession(memory.adapter);
        assert.equal(legacy?.nickname, 'Legado');
        assert.equal(resolvePlayerAvatarId(legacy?.avatarId), 'explorer');
    });

    it('4. joinRoomWithNickname envia avatarId selecionado no POST /rooms/join', async () => {
        const originalFetch = globalThis.fetch;
        const sentPayloads: Array<Record<string, unknown>> = [];

        try {
            globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input.toString();
                if (url.endsWith('/rooms/join')) {
                    sentPayloads.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
                    return new Response(
                        JSON.stringify({
                            player: {
                                id: 'p-1',
                                gameId: 'g-1',
                                roomId: 'r-1',
                                userId: null,
                                nickname: 'Ana',
                                avatarId: 'wizard',
                                score: 0,
                                joinedAt: '2026-11-23T12:00:00.000Z',
                            },
                            sessionToken: 'secret-tok',
                        }),
                        { status: 201, headers: { 'Content-Type': 'application/json' } },
                    );
                }

                return new Response(
                    JSON.stringify({
                        room: {
                            id: 'r-1',
                            code: 'ABC123',
                            name: 'Sala Teste',
                            theme: 'Ciências',
                            maxPlayers: 10,
                            questionTime: 30,
                            gameMode: 'CLASSIC',
                            status: 'WAITING',
                            players: [
                                {
                                    id: 'p-1',
                                    nickname: 'Ana',
                                    avatarId: 'wizard',
                                    score: 0,
                                    joinedAt: '2026-11-23T12:00:00.000Z',
                                },
                            ],
                        },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }) as typeof fetch;

            const joined = await joinRoomWithNickname('ABC123', 'Ana', 'wizard');
            assert.equal(sentPayloads.length, 1);
            assert.equal(sentPayloads[0]?.avatarId, 'wizard');
            assert.equal(joined.player.avatarId, 'wizard');
            assert.equal(joined.lobby.players[0]?.avatarId, 'wizard');
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('5. relatório individual preserva avatares distintos por jogador e aplica fallback legado', () => {
        const report = buildRoomReportFromServerGame({
            questionCount: 2,
            ranking: [
                {
                    id: 'p1',
                    nickname: 'Alice',
                    avatarId: 'fox',
                    score: 200,
                    position: 1,
                    correctCount: 2,
                    wrongCount: 0,
                    answeredCount: 2,
                    joinedAt: '2026-11-23T12:00:00.000Z',
                },
                {
                    id: 'p2',
                    nickname: 'Bob',
                    avatarId: 'robot',
                    score: 100,
                    position: 2,
                    correctCount: 1,
                    wrongCount: 1,
                    answeredCount: 2,
                    joinedAt: '2026-11-23T12:00:05.000Z',
                },
                {
                    id: 'p3',
                    nickname: 'Legado',
                    score: 0,
                    position: 3,
                    correctCount: 0,
                    wrongCount: 2,
                    answeredCount: 2,
                    joinedAt: '2026-11-23T12:00:10.000Z',
                },
            ],
            questions: [
                {
                    questionId: 'q1',
                    statement: 'Pergunta 1',
                    position: 1,
                    roundNumber: 1,
                    roundStatus: 'CLOSED',
                    answeredCount: 3,
                    correctCount: 2,
                    correctRate: 2 / 3,
                },
            ],
        });

        assert.notEqual(report, null);
        assert.deepEqual(
            report!.ranking.map((r) => [r.nickname, r.avatarId]),
            [
                ['Alice', 'fox'],
                ['Bob', 'robot'],
                ['Legado', 'explorer'],
            ],
        );
    });

    it('6. arte vetorial, acessibilidade e pontos de renderização dos avatares estão consistentes', () => {
        const artSrc = readFrontFile('src/components/ui/PlayerAvatar/PlayerAvatarArt.tsx');
        for (const avatarId of PLAYER_AVATAR_IDS) {
            assert.match(artSrc, new RegExp(`case '${avatarId}':`));
        }
        assert.doesNotMatch(artSrc, /dangerouslySetInnerHTML/);
        assert.doesNotMatch(artSrc, /https?:\/\//);

        const avatarSrc = readFrontFile('src/components/ui/PlayerAvatar/PlayerAvatar.tsx');
        assert.match(avatarSrc, /role=\{decorative \? undefined : 'img'\}/);

        const pickerSrc = readFrontFile('src/views/Play/components/AvatarPicker.tsx');
        assert.match(pickerSrc, /role="radiogroup"/);
        assert.match(pickerSrc, /role="radio"/);
        assert.match(pickerSrc, /aria-label=/);
        assert.doesNotMatch(pickerSrc, /play-avatar-picker__name/);
        assert.doesNotMatch(pickerSrc, />\{avatar\.name\}</);
        assert.doesNotMatch(pickerSrc, /activeMeta\.name/);

        const nicknameSrc = readFrontFile('src/views/Play/steps/NicknameStep.tsx');
        assert.doesNotMatch(nicknameSrc, /play-nickname__avatar-caption/);

        const filesUsingAvatar = [
            'src/views/Play/steps/NicknameStep.tsx',
            'src/views/Play/steps/LobbyStep.tsx',
            'src/views/Play/PlayView.tsx',
            'src/views/Play/components/Podium.tsx',
            'src/views/Play/components/RankingList.tsx',
            'src/features/Dashboard/components/RoomPlayersCard.tsx',
            'src/features/Dashboard/components/DashboardForm.tsx',
            'src/views/Dashboard/RoomReportModal/RoomReportModal.tsx',
        ];
        for (const file of filesUsingAvatar) {
            assert.match(readFrontFile(file), /PlayerAvatar/);
        }
    });
});
