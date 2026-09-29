import type { RequestContext } from './http.js';
export declare const getAccessCode: () => string;
export declare const setAccessCookie: (res: RequestContext["res"]) => void;
export declare const clearAccessCookie: (res: RequestContext["res"]) => void;
export declare const hasAccessSession: (req: RequestContext["req"]) => boolean;
export declare const requireAccessSession: (ctx: RequestContext) => void;
//# sourceMappingURL=auth.d.ts.map