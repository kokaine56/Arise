import type { Db } from '../db.js';
import { type Router } from '../http.js';
export declare const registerGoalRoutes: (router: Router, db: Db) => void;
export declare const goalExists: (db: Db, id: string) => Promise<boolean>;
//# sourceMappingURL=goals.d.ts.map