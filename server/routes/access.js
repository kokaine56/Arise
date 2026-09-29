import { badRequest, sendJson } from '../http.js';
import { requireObject, asStringOrNull } from '../validate.js';
import { getAccessCode, setAccessCookie, clearAccessCookie, hasAccessSession } from '../auth.js';
export const registerAccessRoutes = (router) => {
    router.get('/api/access/session', async ({ req, res }) => {
        sendJson(res, 200, {
            authenticated: hasAccessSession(req),
        });
    });
    router.post('/api/access/verify', async ({ body, res }) => {
        const input = requireObject(body);
        const code = asStringOrNull(input['code'], 'code');
        if (!code || !/^\d{4}$/.test(code)) {
            throw badRequest('Invalid code format.');
        }
        if (code === getAccessCode()) {
            setAccessCookie(res);
            sendJson(res, 200, { success: true, authenticated: true });
        }
        else {
            sendJson(res, 401, { success: false, message: 'Incorrect access code' });
        }
    });
    router.post('/api/access/logout', async ({ res }) => {
        clearAccessCookie(res);
        sendJson(res, 200, { success: true });
    });
};
//# sourceMappingURL=access.js.map