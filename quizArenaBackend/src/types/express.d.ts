
import type { GamePlayer, GameStatus, Role, RoomStatus } from "@prisma/client";

export type AuthenticatedGamePlayer = GamePlayer & {
    roomId: string;
    game?: {
        id: string;
        roomId: string;
        status: GameStatus;
        room?: {
            id: string;
            status: RoomStatus;
        };
    };
};

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: Role;
            };

            roomPlayer?: AuthenticatedGamePlayer;
        }
    }
}

export {};
