/**
 * Database row → API row.
 *
 * The API deliberately emits the expected legacy shape.
 *
 *   - booleans: `is_active` is stored as 0/1 (legacy SQLite format) and
 *     converted back here so the client's conditionals mean what they look like.
 *   - `frequency_config`: stored as an object or JSON string.
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
    frequency_config: string | Record<string, unknown>;
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
export declare const parseConfig: (raw: string | Record<string, unknown>) => unknown;
export declare const toGoalRow: (row: DbGoal) => Record<string, unknown>;
export declare const toRecordRow: (row: DbRecord) => Record<string, unknown>;
//# sourceMappingURL=rows.d.ts.map