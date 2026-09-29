import { Db as MongoDb } from 'mongodb';
export type Db = MongoDb;
export declare const openDatabase: () => Promise<Db>;
export declare const closeDatabase: () => Promise<void>;
/**
 * Run `fn` inside a transaction if replica sets are available.
 * For now, this simply executes the function asynchronously.
 */
export declare const transaction: <T>(db: Db, fn: () => Promise<T>) => Promise<T>;
//# sourceMappingURL=db.d.ts.map