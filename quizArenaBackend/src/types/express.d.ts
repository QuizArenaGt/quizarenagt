
import type { Role, RoomPlayer } from "@prisma/client";

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: Role;
            };

            roomPlayer?: RoomPlayer;
        }
    }
}

export {};
