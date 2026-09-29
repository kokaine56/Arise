/**
 * Request payload validation.
 *
 * The schema is the real validation layer — every rule here is also enforced by
 * a CHECK constraint or a trigger, and the database has the final word. What
 * this layer adds is a legible 400 instead of a SQLite type error, and it keeps
 * the route handlers from having to reason about `unknown`.
 */
export declare const requireObject: (body: unknown) => Record<string, unknown>;
/** Present and a string. `null` and `undefined` are not accepted as strings. */
export declare const asString: (value: unknown, field: string, max?: number) => string;
/** A string, or null. Used for every optional text column. */
export declare const asStringOrNull: (value: unknown, field: string, max?: number) => string | null;
export declare const asNumberOrNull: (value: unknown, field: string) => number | null;
export declare const asInteger: (value: unknown, field: string) => number;
export declare const asBoolean: (value: unknown, field: string) => boolean;
export declare const asOneOf: <T extends string>(value: unknown, field: string, allowed: readonly T[]) => T;
/** A 'YYYY-MM-DD' calendar date. The schema re-checks this; this gives a better message. */
export declare const asCivilDate: (value: unknown, field: string) => string;
export declare const asCivilDateOrNull: (value: unknown, field: string) => string | null;
export declare const asClockOrNull: (value: unknown, field: string) => string | null;
/**
 * The `frequency_config` column is TEXT holding JSON, and the trigger requires
 * its `kind` to equal `frequency_type`.
 *
 * A missing `kind` is filled in from `frequencyType`, since the type is the
 * authoritative field. A `kind` that *disagrees* is rejected rather than
 * corrected: silently rewriting it would mean the trigger below never fires for
 * any request arriving through the API, which is precisely the bug the trigger
 * was written to catch. Only a genuine client bug can produce this, and the
 * honest response is to say so.
 */
export declare const asFrequencyConfig: (value: unknown, frequencyType: string) => string;
//# sourceMappingURL=validate.d.ts.map