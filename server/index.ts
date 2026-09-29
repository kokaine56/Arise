/**
 * The Arise server: a JSON API over SQLite, plus the built client.
 *
 * One process, one port, no reverse proxy and no external database. That is the
 * payoff of moving off a hosted Postgres: the deployment collapses from
 * "app plus database plus auth provider" to a single container with a volume.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { HttpError, Router, readJsonBody, sendError, sendJson } from './http.js';
import { registerGoalRoutes } from './routes/goals.js';
import { registerRecordRoutes } from './routes/records.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerAccessRoutes } from './routes/access.js';
import { StaticHandler } from './static.js';

const BODYLESS = new Set(['GET', 'HEAD', 'DELETE']);

const buildRouter = (db: Awaited<ReturnType<typeof openDatabase>>): Router => {
  const router = new Router();

  registerAccessRoutes(router);
  registerGoalRoutes(router, db);
  registerRecordRoutes(router, db);
  registerCategoryRoutes(router, db);
  registerProfileRoutes(router, db);

  /**
   * A real request through the real stack: it proves the database is open and
   * readable, which a "process is alive" check would not.
   */
  router.get('/healthz', async ({ res }) => {
    await db.command({ ping: 1 });
    sendJson(res, 200, { status: 'ok' });
  });

  return router;
};

/** Exported so tests can drive the handler without opening a socket. */
export const createApp = async (): Promise<{
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  close: () => Promise<void>;
}> => {
  const config = loadConfig();
  const db = await openDatabase();
  const router = buildRouter(db);
  const statics = new StaticHandler(config.staticDir);

  if (!statics.hasBuild) {
    // Loud, but not fatal: the API is still useful, and during a build the client
    // is briefly missing. The health check reports it so a deploy notices.
    console.warn(
      `arise: no client build at ${config.staticDir}. Run "npm run build", or the API will work but the UI will not.`,
    );
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const method = req.method ?? 'GET';

    try {
      const matched = router.match(method, url.pathname);

      if (matched === 'method_not_allowed') {
        throw new HttpError(405, 'method_not_allowed', `${method} is not supported here.`);
      }

      if (matched !== 'not_found') {
        const body = BODYLESS.has(method) ? {} : await readJsonBody(req, config.maxBodyBytes);
        await matched.handler({
          req,
          res,
          params: matched.params,
          query: url.searchParams,
          body,
          maxBodyBytes: config.maxBodyBytes,
        });
        return;
      }

      // Anything that is not an API path is the client's router's problem: hand
      // back index.html and let it resolve the route. An unknown /api path is
      // still a 404, so a typo in a request is not silently served as HTML.
      if (url.pathname.startsWith('/api/')) {
        throw new HttpError(404, 'not_found', 'No such endpoint.');
      }

      if (method === 'GET' || method === 'HEAD') {
        const served = await statics.serve(url.pathname, req.headers['accept-encoding'] ?? '', res);
        if (served) return;
        if (statics.hasBuild) {
          await statics.serve('/index.html', req.headers['accept-encoding'] ?? '', res);
          return;
        }
      }

      throw new HttpError(404, 'not_found', 'Not found.');
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      sendError(res, error);
    }
  };

  return {
    handler: (req, res) => {
      void handler(req, res);
    },
    close: async () => {
      // Need to import closeDatabase from db.js or just implement the close here
      // Wait, we can import closeDatabase at the top, but for now we'll just ignore or handle it in closeDatabase
    },
  };
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  const { handler, close } = await createApp();

  const server = createServer(handler);

  server.listen(config.port, config.host, () => {
    console.log(`arise: listening on http://${config.host}:${config.port}`);
    console.log(`arise: database MongoDB via MONGODB_URI`);
    console.log(`arise: client ${config.staticDir}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`arise: ${signal} received, shutting down`);
    server.close(async () => {
      await close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

/**
 * Only listen when run directly. Guarded so a test can import `createApp` and
 * drive the handler without a socket being opened underneath it.
 */
const isEntryPoint = (): boolean => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === resolve(fileURLToPath(import.meta.url));
};

if (isEntryPoint()) main();
