import { notFound, sendJson } from '../http.js';
import { asBoolean, asClockOrNull, asString, asStringOrNull, requireObject, } from '../validate.js';
const toProfile = (row) => ({
    id: row.id,
    display_name: row.display_name,
    timezone: row.timezone,
    created_at: row.created_at,
    updated_at: row.updated_at,
});
const toSettings = (row) => ({
    week_starts_on: row.week_starts_on,
    notifications_enabled: row.notifications_enabled === 1,
    default_reminder_time: row.default_reminder_time,
    default_unit: row.default_unit,
    hide_empty_history_days: row.hide_empty_history_days === 1,
});
const readProfile = async (db) => {
    let doc = await db.collection('profiles').findOne({ id: 1 });
    if (!doc) {
        const newProfile = {
            id: 1,
            display_name: 'Guest',
            timezone: 'UTC',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        await db.collection('profiles').insertOne(newProfile);
        doc = await db.collection('profiles').findOne({ id: 1 });
    }
    return doc;
};
const readSettings = async (db) => {
    let doc = await db.collection('user_settings').findOne({ id: 1 });
    if (!doc) {
        const newSettings = {
            id: 1,
            week_starts_on: 1,
            notifications_enabled: 0,
            default_reminder_time: null,
            default_unit: null,
            hide_empty_history_days: 0
        };
        await db.collection('user_settings').insertOne(newSettings);
        doc = await db.collection('user_settings').findOne({ id: 1 });
    }
    return doc;
};
export const registerProfileRoutes = (router, db) => {
    router.get('/api/profile', async ({ res }) => {
        const profile = await readProfile(db);
        sendJson(res, 200, toProfile(profile));
    });
    router.patch('/api/profile', async ({ body, res }) => {
        const patch = requireObject(body);
        const sets = { updated_at: new Date().toISOString() };
        if (patch['displayName'] !== undefined) {
            sets.display_name = asString(patch['displayName'], 'displayName', 60);
        }
        if (patch['timezone'] !== undefined) {
            const zone = asString(patch['timezone'], 'timezone', 64);
            if (!isValidTimeZone(zone)) {
                throw notFound('That is not a time zone Arise recognises.');
            }
            sets.timezone = zone;
        }
        if (Object.keys(sets).length > 1) {
            await db.collection('profiles').updateOne({ id: 1 }, { $set: sets });
        }
        const updated = await readProfile(db);
        sendJson(res, 200, toProfile(updated));
    });
    router.get('/api/settings', async ({ res }) => {
        const settings = await readSettings(db);
        sendJson(res, 200, toSettings(settings));
    });
    router.patch('/api/settings', async ({ body, res }) => {
        const patch = requireObject(body);
        const sets = {};
        if (patch['weekStartsOn'] !== undefined) {
            const week = patch['weekStartsOn'];
            if (week !== 1 && week !== 7)
                throw notFound('The week must start on Monday or Sunday.');
            sets.week_starts_on = week;
        }
        if (patch['notificationsEnabled'] !== undefined) {
            sets.notifications_enabled = asBoolean(patch['notificationsEnabled'], 'notificationsEnabled') ? 1 : 0;
        }
        if (patch['defaultReminderTime'] !== undefined) {
            sets.default_reminder_time = asClockOrNull(patch['defaultReminderTime'], 'defaultReminderTime');
        }
        if (patch['defaultUnit'] !== undefined) {
            sets.default_unit = asStringOrNull(patch['defaultUnit'], 'defaultUnit', 16);
        }
        if (patch['hideEmptyHistoryDays'] !== undefined) {
            sets.hide_empty_history_days = asBoolean(patch['hideEmptyHistoryDays'], 'hideEmptyHistoryDays') ? 1 : 0;
        }
        if (Object.keys(sets).length > 0) {
            await db.collection('user_settings').updateOne({ id: 1 }, { $set: sets });
        }
        const updated = await readSettings(db);
        sendJson(res, 200, toSettings(updated));
    });
};
const isValidTimeZone = (zone) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    }
    catch {
        return false;
    }
};
//# sourceMappingURL=profile.js.map