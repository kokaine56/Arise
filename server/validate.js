/**
 * Request payload validation.
 *
 * The schema is the real validation layer — every rule here is also enforced by
 * a CHECK constraint or a trigger, and the database has the final word. What
 * this layer adds is a legible 400 instead of a SQLite type error, and it keeps
 * the route handlers from having to reason about `unknown`.
 */
import { badRequest } from './http.js';
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
export const requireObject = (body) => {
    if (!isPlainObject(body))
        throw badRequest('Expected a JSON object.');
    return body;
};
/** Present and a string. `null` and `undefined` are not accepted as strings. */
export const asString = (value, field, max = 500) => {
    if (typeof value !== 'string')
        throw badRequest(`${field} must be a string.`);
    if (value.length > max)
        throw badRequest(`${field} must be at most ${max} characters.`);
    return value;
};
/** A string, or null. Used for every optional text column. */
export const asStringOrNull = (value, field, max = 500) => {
    if (value === null || value === undefined)
        return null;
    return asString(value, field, max);
};
export const asNumberOrNull = (value, field) => {
    if (value === null || value === undefined)
        return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw badRequest(`${field} must be a number.`);
    }
    return value;
};
export const asInteger = (value, field) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw badRequest(`${field} must be a whole number.`);
    }
    return value;
};
export const asBoolean = (value, field) => {
    if (typeof value !== 'boolean')
        throw badRequest(`${field} must be true or false.`);
    return value;
};
export const asOneOf = (value, field, allowed) => {
    if (typeof value !== 'string' || !allowed.includes(value)) {
        throw badRequest(`${field} must be one of: ${allowed.join(', ')}.`);
    }
    return value;
};
/** A 'YYYY-MM-DD' calendar date. The schema re-checks this; this gives a better message. */
export const asCivilDate = (value, field) => {
    const text = asString(value, field, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw badRequest(`${field} must be a date in YYYY-MM-DD form.`);
    }
    return text;
};
export const asCivilDateOrNull = (value, field) => value === null || value === undefined ? null : asCivilDate(value, field);
export const asClockOrNull = (value, field) => {
    if (value === null || value === undefined)
        return null;
    const text = asString(value, field, 5);
    if (!/^\d{2}:\d{2}$/.test(text))
        throw badRequest(`${field} must be a time in HH:MM form.`);
    return text;
};
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
export const asFrequencyConfig = (value, frequencyType) => {
    if (!isPlainObject(value))
        throw badRequest('frequencyConfig must be an object.');
    if (value['kind'] !== undefined && value['kind'] !== frequencyType) {
        throw badRequest(`frequencyConfig is for "${String(value['kind'])}" but frequencyType is "${frequencyType}".`);
    }
    const config = { ...value, kind: frequencyType };
    if (frequencyType === 'selected_days') {
        if (!Array.isArray(config['days']) || config['days'].length === 0) {
            throw badRequest('selected_days needs a non-empty list of days.');
        }
        const days = config['days'].map((day, index) => asInteger(day, `days[${index}]`));
        if (days.some((day) => day < 1 || day > 7)) {
            throw badRequest('Days must be 1 (Monday) through 7 (Sunday).');
        }
        config['days'] = [...new Set(days)].sort((a, b) => a - b);
    }
    if (frequencyType === 'weekly') {
        config['everyWeeks'] = Math.max(1, asInteger(config['everyWeeks'] ?? 1, 'everyWeeks'));
    }
    if (frequencyType === 'custom_interval') {
        config['everyNDays'] = Math.max(2, asInteger(config['everyNDays'] ?? 2, 'everyNDays'));
    }
    return JSON.stringify(config);
};
//# sourceMappingURL=validate.js.map