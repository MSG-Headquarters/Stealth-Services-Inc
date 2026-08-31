/**
 * Sunday Auth SDK v2.1 (Patched)
 * Authentication gate for SSI and partner applications
 * 
 * FIXES in v2.1:
 * - Redirect loop prevention
 * - Cross-domain localStorage token sync
 * - Hash-based token passing fallback
 * - Better desktop fallback (no biometrics)
 * 
 * Usage:
 *   SundayAuth.init({ appId: 'ssi', requireAuth: true });
 */

const SundayAuth = (function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // Configuration
    // ═══════════════════════════════════════════════════════════════════════════
    const CONFIG = {
        SUNDAY_URL: 'https://www.umbrassi.com/Sunday/',
        API_URL: 'https://sunday-platform.onrender.com/api/oauth',
        TOKEN_KEY: 'sunday_access_token',
        REFRESH_KEY: 'sunday_refresh_token',
        USER_KEY: 'sunday_user',
        SESSION_KEY: 'sunday_session',
        REDIRECT_FLAG: 'sunday_auth_redirect',
        REDIRECT_COUNT: 'sunday_redirect_count',
        TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000,
        MAX_REDIRECTS: 2, // Prevent infinite loops
    };

    // Also check Sunday's native token keys
    const SUNDAY_NATIVE_KEYS = [
        'sunday_token',
        'sundayToken', 
        'sunday_jwt',
        'authToken',
        'token'
    ];

    let currentUser = null;
    let config = {};
    let isInitialized = false;

    // ═══════════════════════════════════════════════════════════════════════════
    // Token Management
    // ═══════════════════════════════════════════════════════════════════════════
    function getToken() {
        // First check our key
        let token = localStorage.getItem(CONFIG.TOKEN_KEY);
        if (token) return token;

        // Check Sunday's native keys
        for (const key of SUNDAY_NATIVE_KEYS) {
            token = localStorage.getItem(key);
            if (token && token.startsWith('eyJ')) { // JWT check
                console.log('[SundayAuth] Found token in:', key);
                // Copy to our key for future use
                localStorage.setItem(CONFIG.TOKEN_KEY, token);
                return token;
            }
        }

        // Check sessionStorage too
        for (const key of [CONFIG.TOKEN_KEY, ...SUNDAY_NATIVE_KEYS]) {
            token = sessionStorage.getItem(key);
            if (token && token.startsWith('eyJ')) {
                console.log('[SundayAuth] Found token in sessionStorage:', key);
                localStorage.setItem(CONFIG.TOKEN_KEY, token);
                return token;
            }
        }

        return null;
    }

    function setToken(token) {
        localStorage.setItem(CONFIG.TOKEN_KEY, token);
        // Also set in Sunday's expected location for cross-app compatibility
        localStorage.setItem('sunday_token', token);
    }

    function getRefreshToken() {
        return localStorage.getItem(CONFIG.REFRESH_KEY);
    }

    function setRefreshToken(token) {
        localStorage.setItem(CONFIG.REFRESH_KEY, token);
    }

    function clearTokens() {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.REFRESH_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
        localStorage.removeItem(CONFIG.SESSION_KEY);
        localStorage.removeItem(CONFIG.REDIRECT_FLAG);
        localStorage.removeItem(CONFIG.REDIRECT_COUNT);
        // Clear Sunday native keys too
        SUNDAY_NATIVE_KEYS.forEach(key => localStorage.removeItem(key));
        currentUser = null;
    }

    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('[SundayAuth] JWT parse error:', e);
            return null;
        }
    }

    function isTokenExpired(token) {
        if (!token) return true;
        const payload = parseJwt(token);
        if (!payload || !payload.exp) return true;
        return (payload.exp * 1000) < (Date.now() + CONFIG.TOKEN_EXPIRY_BUFFER);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Redirect Loop Prevention
    // ═══════════════════════════════════════════════════════════════════════════
    function getRedirectCount() {
        const count = parseInt(localStorage.getItem(CONFIG.REDIRECT_COUNT) || '0', 10);
        return count;
    }

    function incrementRedirectCount() {
        const count = getRedirectCount() + 1;
        localStorage.setItem(CONFIG.REDIRECT_COUNT, count.toString());
        return count;
    }

    function resetRedirectCount() {
        localStorage.removeItem(CONFIG.REDIRECT_COUNT);
        localStorage.removeItem(CONFIG.REDIRECT_FLAG);
    }

    function isInRedirectLoop() {
        return getRedirectCount() >= CONFIG.MAX_REDIRECTS;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API Methods
    // ═══════════════════════════════════════════════════════════════════════════
    async function verifyToken(token) {
        // Skip verification if token looks valid and we're avoiding loops
        if (isInRedirectLoop()) {
            console.log('[SundayAuth] Skipping verification to break loop');
            const payload = parseJwt(token);
            return payload && payload.exp && (payload.exp * 1000 > Date.now());
        }

        try {
            const response = await fetch(`${CONFIG.API_URL}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const data = await response.json();
            return data.active === true;
        } catch (error) {
            console.error('[SundayAuth] Token verification failed:', error);
            // On network error, trust local JWT validation
            const payload = parseJwt(token);
            return payload && payload.exp && (payload.exp * 1000 > Date.now());
        }
    }

    async function refreshAccessToken() {
        const refreshToken = getRefreshToken();
        if (!refreshToken) return null;

        try {
            const response = await fetch(`${CONFIG.API_URL}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });

            if (!response.ok) throw new Error('Refresh failed');

            const data = await response.json();
            if (data.access_token) {
                setToken(data.access_token);
                if (data.refresh_token) {
                    setRefreshToken(data.refresh_token);
                }
                return data.access_token;
            }
        } catch (error) {
            console.error('[SundayAuth] Token refresh failed:', error);
        }
        return null;
    }

    async function fetchUserInfo(token) {
        try {
            const response = await fetch(`${CONFIG.API_URL}/userinfo`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch user info');
            return await response.json();
        } catch (error) {
            console.error('[SundayAuth] Failed to fetch user info:', error);
            // Return basic info from JWT
            const payload = parseJwt(token);
            if (payload) {
                return {
                    sub: payload.sub || payload.userId,
                    name: payload.name || 'User',
                    fromJwt: true
                };
            }
            return null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OAuth Flow
    // ═══════════════════════════════════════════════════════════════════════════
    function redirectToSunday() {
        // Check for redirect loop
        const count = incrementRedirectCount();
        if (count > CONFIG.MAX_REDIRECTS) {
            console.error('[SundayAuth] Redirect loop detected! Stopping redirect.');
            showManualLoginPrompt();
            return;
        }

        // Set flag so we know we're in a redirect flow
        localStorage.setItem(CONFIG.REDIRECT_FLAG, Date.now().toString());

        const params = new URLSearchParams({
            app: config.appId || 'ssi',
            redirect: window.location.origin + window.location.pathname,
            ts: Date.now()
        });
        
        console.log('[SundayAuth] Redirecting to Sunday...', params.toString());
        window.location.href = `${config.sundayUrl || CONFIG.SUNDAY_URL}?${params}`;
    }

    function showManualLoginPrompt() {
        // Show a non-redirecting login option
        const gate = document.getElementById('authGate');
        if (gate) {
            gate.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🔐</div>
                    <h2 style="margin-bottom: 1rem; color: #E8E8E8;">Authentication Required</h2>
                    <p style="color: #B8B8B8; margin-bottom: 2rem;">Please sign in to Sunday first, then return here.</p>
                    <a href="${CONFIG.SUNDAY_URL}" target="_blank" 
                       style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #0EA5E9, #14B8A6); 
                              color: white; text-decoration: none; border-radius: 12px; font-weight: 600;">
                        Open Sunday Login
                    </a>
                    <button onclick="SundayAuth.forceReset(); location.reload();" 
                            style="display: block; margin: 1rem auto 0; padding: 12px 24px; background: transparent; 
                                   border: 1px solid #4CAF50; color: #4CAF50; border-radius: 8px; cursor: pointer;">
                        I've signed in - Retry
                    </button>
                </div>
            `;
        }
    }

    async function handleCallback() {
        const params = new URLSearchParams(window.location.search);
        const hash = window.location.hash;
        
        // Check URL params
        const code = params.get('code');
        const token = params.get('token');
        const error = params.get('error');
        const authSuccess = params.get('auth') === 'success';

        // Check hash for token (alternative passing method)
        let hashToken = null;
        if (hash && hash.includes('token=')) {
            const hashParams = new URLSearchParams(hash.substring(1));
            hashToken = hashParams.get('token');
        }

        if (error) {
            console.error('[SundayAuth] OAuth error:', error);
            resetRedirectCount();
            if (config.onAuthFailure) config.onAuthFailure(error);
            return false;
        }

        // Clean URL function
        const cleanUrl = () => {
            const cleanPath = window.location.pathname;
            window.history.replaceState({}, document.title, cleanPath);
        };

        // Handle direct token in URL
        if (token || hashToken) {
            const finalToken = token || hashToken;
            console.log('[SundayAuth] Received token from callback');
            setToken(finalToken);
            cleanUrl();
            resetRedirectCount();
            return await validateSession();
        }

        // Handle auth success flag (Sunday sets this when user is authenticated)
        if (authSuccess) {
            console.log('[SundayAuth] Auth success flag detected');
            cleanUrl();
            // Token should be in localStorage now, check it
            const existingToken = getToken();
            if (existingToken) {
                resetRedirectCount();
                return await validateSession();
            }
        }

        // Handle authorization code flow
        if (code) {
            try {
                console.log('[SundayAuth] Exchanging auth code...');
                const response = await fetch(`${CONFIG.API_URL}/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        grant_type: 'authorization_code',
                        code: code,
                        app_id: config.appId || 'ssi'
                    })
                });

                if (!response.ok) throw new Error('Token exchange failed');

                const data = await response.json();
                if (data.access_token) {
                    setToken(data.access_token);
                    if (data.refresh_token) {
                        setRefreshToken(data.refresh_token);
                    }
                    cleanUrl();
                    resetRedirectCount();
                    return await validateSession();
                }
            } catch (error) {
                console.error('[SundayAuth] Code exchange failed:', error);
            }
        }

        // Check if we just came back from Sunday (redirect flag is set)
        const redirectFlag = localStorage.getItem(CONFIG.REDIRECT_FLAG);
        if (redirectFlag) {
            const redirectTime = parseInt(redirectFlag, 10);
            const timeSinceRedirect = Date.now() - redirectTime;
            
            // If we redirected within the last 30 seconds, check for token
            if (timeSinceRedirect < 30000) {
                console.log('[SundayAuth] Recently redirected, checking for token...');
                const existingToken = getToken();
                if (existingToken) {
                    console.log('[SundayAuth] Found token after redirect');
                    resetRedirectCount();
                    return await validateSession();
                }
            }
        }

        return false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Session Management
    // ═══════════════════════════════════════════════════════════════════════════
    async function validateSession() {
        let token = getToken();
        
        if (!token) {
            console.log('[SundayAuth] No token found');
            return false;
        }

        console.log('[SundayAuth] Validating token...');

        // Check if token is expired locally first
        if (isTokenExpired(token)) {
            console.log('[SundayAuth] Token expired, attempting refresh...');
            token = await refreshAccessToken();
            if (!token) {
                console.log('[SundayAuth] Refresh failed, trying to get new token');
                return false;
            }
        }

        // Verify token
        const isValid = await verifyToken(token);
        if (!isValid) {
            console.log('[SundayAuth] Token invalid');
            clearTokens();
            return false;
        }

        // Fetch user info
        const userInfo = await fetchUserInfo(token);
        if (userInfo) {
            currentUser = userInfo;
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(userInfo));
            localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({
                validatedAt: Date.now(),
                expiresAt: parseJwt(token)?.exp * 1000
            }));
            console.log('[SundayAuth] Session validated for:', userInfo.name || userInfo.sub);
        }

        // Success - reset any redirect counters
        resetRedirectCount();
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Public API
    // ═══════════════════════════════════════════════════════════════════════════
    async function init(options = {}) {
        if (isInitialized) {
            console.warn('[SundayAuth] Already initialized');
            return getUser();
        }

        config = {
            appId: options.appId || 'ssi',
            requireAuth: options.requireAuth !== false,
            onAuthSuccess: options.onAuthSuccess,
            onAuthFailure: options.onAuthFailure,
            sundayUrl: options.sundayUrl || CONFIG.SUNDAY_URL,
            apiUrl: options.apiUrl || CONFIG.API_URL
        };

        if (config.apiUrl) CONFIG.API_URL = config.apiUrl;

        console.log('[SundayAuth] Initializing v2.1...', { appId: config.appId });

        // Check for OAuth callback first
        const hasCallback = await handleCallback();
        
        if (!hasCallback) {
            // Validate existing session
            const isValid = await validateSession();
            
            if (!isValid && config.requireAuth) {
                // Check if we're in a redirect loop
                if (isInRedirectLoop()) {
                    console.error('[SundayAuth] Redirect loop detected, showing manual login');
                    showManualLoginPrompt();
                    if (config.onAuthFailure) {
                        config.onAuthFailure('redirect_loop');
                    }
                    return null;
                }
                
                console.log('[SundayAuth] No valid session, redirecting to Sunday...');
                redirectToSunday();
                return null;
            }
        }

        isInitialized = true;

        // Load cached user if available
        if (!currentUser) {
            const cached = localStorage.getItem(CONFIG.USER_KEY);
            if (cached) {
                try {
                    currentUser = JSON.parse(cached);
                } catch (e) {}
            }
        }

        if (currentUser && config.onAuthSuccess) {
            config.onAuthSuccess(currentUser);
        }

        return currentUser;
    }

    function getUser() {
        if (currentUser) return currentUser;
        const cached = localStorage.getItem(CONFIG.USER_KEY);
        if (cached) {
            try {
                currentUser = JSON.parse(cached);
                return currentUser;
            } catch (e) {}
        }
        return null;
    }

    function isAuthenticated() {
        const token = getToken();
        if (!token) return false;
        return !isTokenExpired(token);
    }

    function logout() {
        clearTokens();
        if (config.requireAuth) {
            redirectToSunday();
        } else {
            window.location.reload();
        }
    }

    function getAccessToken() {
        return getToken();
    }

    // Expose for debugging
    function debug() {
        return {
            version: '2.1',
            token: getToken() ? getToken().substring(0, 20) + '...' : null,
            tokenValid: getToken() ? !isTokenExpired(getToken()) : false,
            refreshToken: getRefreshToken() ? 'present' : null,
            user: currentUser,
            config: config,
            isInitialized: isInitialized,
            redirectCount: getRedirectCount(),
            session: JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY) || '{}')
        };
    }

    // Force reset (for debugging stuck states)
    function forceReset() {
        clearTokens();
        resetRedirectCount();
        console.log('[SundayAuth] Force reset complete');
    }

    return {
        init,
        getUser,
        isAuthenticated,
        logout,
        getAccessToken,
        refreshAccessToken,
        debug,
        forceReset,
        // For apps that need direct control
        redirectToSunday,
        validateSession,
        clearTokens
    };

})();

// Auto-export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SundayAuth;
}
