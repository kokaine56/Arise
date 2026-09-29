/**
 * Database row → API row.
 *
 * The client already has row types and mappers written against the shape it got
 * from Supabase, so the API deliberately emits that same shape rather than
 * SQLite's native one. Two conversions matter:
 *
 *   - booleans. SQLite has no boolean type; `is_active` is stored as 0/1 and
 *     would reach the client as a number, where `if (row.is_active)` still
 *     happens to work but `row.is_active === false` does not. They are converted
 *     back here so the client's conditionals mean what they look like.
 *   - `frequency_config`, stored as TEXT so the schema can CHECK json_valid(),
 *     parsed back to an object because that is what the scheduler consumes.
 *
 * Keeping this in one place is what stops SQLite's storage details from leaking
 * into the domain layer.
 */
export interface DbGoal {
    id: string;
    name: string;
    description: string | null;
    goal_type: string;
    target_value: number | null;
    unit: string | null;
    target_time: string | null;
    category_id: string | null;
    frequency_type: string;
    frequency_config: string;
    start_date: string;
    end_date: string | null;
    reminder_time: string | null;
    is_active: number;
    sort_order: number;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
}
export interface DbRecord {
    id: string;
    goal_id: string;
    date: string;
    completed: number;
    actual_value: number | null;
    notes: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}
export declare const parseConfig: (raw: string) => unknown;
export declare const toGoalRow: (row: DbGoal) => Record<string, unknown>;
export declare const toRecordRow: (row: DbRecord) => Record<string, unknown>;
//# sourceMappingURL=rows.d.ts.map