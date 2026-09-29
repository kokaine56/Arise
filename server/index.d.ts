/**
 * The Arise server: a JSON API over SQLite, plus the built client.
 *
 * One process, one port, no reverse proxy and no external database. That is the
 * payoff of moving off a hosted Postgres: the deployment collapses from
 * "app plus database plus auth provider" to a single container with a volume.
 */
import { type IncomingMessage, type ServerResponse } from 'node:http';
/** Exported so tests can drive the handler without opening a socket. */
export declare const createApp: () => Promise<{
    handler: (req: IncomingMessage, res: ServerResponse) => void;
    close: () => Promise<void>;
}>;
//# sourceMappingURL=index.d.ts.map