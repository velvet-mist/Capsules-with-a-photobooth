import { API_BASE, AUTH_TOKEN_KEY } from "./constants.js";

export function getStoredAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function setStoredAuthToken(token) {
    if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}

export async function apiRequest(pathname, options = {}) {
    const headers = { ...options.headers };
    const authToken = getStoredAuthToken();
    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    let body = options.body;
    if (body && typeof body === "object" && !(body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${pathname}`, {
        ...options,
        headers,
        body
    });

    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch (_error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}
