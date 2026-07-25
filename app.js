(function () {
    'use strict';

    var API_URL = 'https://script.google.com/macros/s/AKfycbyOMkD50zJUfyv5C-mHDXXU59dqxzarODmC9swfP55nlH8tSiKZKp8g2kWSGOwO7i9E/exec';
    var STORAGE = {
        token: 'tealove_token',
        expiresAt: 'tealove_expiresAt',
        role: 'tealove_role',
        name: 'tealove_username',
        employeeId: 'tealove_empId',
        rate: 'tealove_rate'
    };

    var ERROR_MESSAGES = {
        INVALID_CREDENTIALS: '帳號或密碼錯誤，請重新確認。',
        UNAUTHORIZED: '登入狀態已失效，請重新登入。',
        INVALID_FIELD: '送出的資料不完整，請重新操作。',
        FORBIDDEN: '目前帳號沒有執行這項操作的權限。',
        SHIFT_FULL: '該時段已達人數上限，請選擇其他班別。',
        INVALID_EMPLOYEE: '員工不存在或已停用。',
        RESET_DISABLED: 'Demo 重設功能目前未開放。',
        RATE_LIMITED: '嘗試次數過多，請稍後再試。',
        NOT_CONFIGURED: 'Demo 服務尚未完成初始化。'
    };

    function getSession() {
        var expiresAt = Number(localStorage.getItem(STORAGE.expiresAt) || 0);
        return {
            token: localStorage.getItem(STORAGE.token) || '',
            expiresAt: expiresAt,
            role: localStorage.getItem(STORAGE.role) || '',
            name: localStorage.getItem(STORAGE.name) || '',
            employeeId: localStorage.getItem(STORAGE.employeeId) || '',
            rate: Number(localStorage.getItem(STORAGE.rate) || 0)
        };
    }

    function saveSession(result) {
        var expiresAt = Date.now() + Number(result.expiresIn || 0) * 1000;
        localStorage.setItem(STORAGE.token, result.token || '');
        localStorage.setItem(STORAGE.expiresAt, String(expiresAt));
        localStorage.setItem(STORAGE.role, result.role || '');
        localStorage.setItem(STORAGE.name, result.name || '');
        localStorage.setItem(STORAGE.employeeId, result.employeeId || '');
        localStorage.setItem(STORAGE.rate, String(result.rate || 0));
        return getSession();
    }

    function clearSession() {
        Object.keys(STORAGE).forEach(function (key) {
            localStorage.removeItem(STORAGE[key]);
        });
    }

    function hasValidSession() {
        var session = getSession();
        return !!session.token && session.expiresAt > Date.now() + 5000;
    }

    function requireSession(requiredRole) {
        var session = getSession();
        if (!hasValidSession()) {
            clearSession();
            window.location.replace('login.html?expired=1');
            return null;
        }
        if (requiredRole && session.role !== requiredRole) {
            window.location.replace('index.html');
            return null;
        }
        return session;
    }

    function getErrorMessage(error) {
        if (!error) return '服務暫時無法使用，請稍後再試。';
        var code = error.code || '';
        return ERROR_MESSAGES[code] || error.message || '服務暫時無法使用，請稍後再試。';
    }

    async function request(action, payload, options) {
        var body = Object.assign({}, payload || {}, { action: action });
        var settings = options || {};
        var session = getSession();

        if (!settings.public) {
            if (!hasValidSession()) {
                clearSession();
                var expiredError = new Error(ERROR_MESSAGES.UNAUTHORIZED);
                expiredError.code = 'UNAUTHORIZED';
                throw expiredError;
            }
            body.token = session.token;
        }

        var response;
        try {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body),
                redirect: 'follow'
            });
        } catch (networkError) {
            var offlineError = new Error('無法連線至 Demo 服務，請檢查網路後重試。');
            offlineError.code = 'NETWORK_ERROR';
            throw offlineError;
        }

        var text = await response.text();
        var result;
        try {
            result = JSON.parse(text);
        } catch (parseError) {
            var formatError = new Error('伺服器回傳格式異常，請稍後再試。');
            formatError.code = 'INVALID_RESPONSE';
            throw formatError;
        }

        if (!result.success) {
            var detail = result.error || { code: 'UNKNOWN', message: result.message };
            var apiError = new Error(getErrorMessage(detail));
            apiError.code = detail.code || 'UNKNOWN';
            if (apiError.code === 'UNAUTHORIZED') clearSession();
            throw apiError;
        }

        return result.data === undefined ? result : result.data;
    }

    async function login(username, password) {
        var result = await request('login', { username: username, password: password }, { public: true });
        return saveSession(result);
    }

    async function logout() {
        try {
            if (hasValidSession()) await request('logout');
        } catch (error) {
            console.warn('Logout request failed:', error.code || error.message);
        } finally {
            clearSession();
            window.location.replace('login.html');
        }
    }

    function getIsoWeek(date) {
        var value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        var day = value.getUTCDay() || 7;
        value.setUTCDate(value.getUTCDate() + 4 - day);
        var yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
        return {
            year: value.getUTCFullYear(),
            week: Math.ceil((((value - yearStart) / 86400000) + 1) / 7)
        };
    }

    window.TeaLove = {
        API_URL: API_URL,
        request: request,
        login: login,
        logout: logout,
        getSession: getSession,
        clearSession: clearSession,
        hasValidSession: hasValidSession,
        requireSession: requireSession,
        getErrorMessage: getErrorMessage,
        getIsoWeek: getIsoWeek
    };
})();
