/**
 * Database row → API row.
 *
 * The API deliberately emits the expected legacy shape.
 *
 *   - booleans: `is_active` is stored as 0/1 (legacy SQLite format) and
 *     converted back here so the client's conditionals mean what they look like.
 *   - `frequency_config`: stored as an object or JSON string.
 */
export const parseConfig = (raw) => {
    if (typeof raw === 'object' && raw !== null)
        return raw;
    try {
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
};
export const toGoalRow = (row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    goal_type: row.goal_type,
    target_value: row.target_value,
    unit: row.unit,
    target_time: row.target_time,
    category_id: row.category_id,
    frequency_type: row.frequency_type,
    frequency_config: parseConfig(row.frequency_config),
    start_date: row.start_date,
    end_date: row.end_date,
    reminder_time: row.reminder_time,
    is_active: row.is_active === 1,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
});
export const toRecordRow = (row) => ({
    id: row.id,
    goal_id: row.goal_id,
    date: row.date,
    completed: row.completed === 1,
    actual_value: row.actual_value,
    notes: row.notes,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
});
//# sourceMappingURL=rows.js.map