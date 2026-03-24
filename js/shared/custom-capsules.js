import {
    CUSTOM_CAPSULES_KEY,
    LEGACY_CUSTOM_CAPSULES_KEY
} from "./constants.js";

export function readCustomCapsules() {
    try {
        const current = JSON.parse(localStorage.getItem(CUSTOM_CAPSULES_KEY) || "null");
        if (Array.isArray(current)) return current;

        const legacy = JSON.parse(localStorage.getItem(LEGACY_CUSTOM_CAPSULES_KEY) || "[]");
        if (!Array.isArray(legacy)) return [];

        const migrated = legacy.map((entry) => ({
            ...entry,
            id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            person: entry.person || `capsule-${Math.random().toString(36).slice(2, 8)}`
        }));
        if (migrated.length) {
            localStorage.setItem(CUSTOM_CAPSULES_KEY, JSON.stringify(migrated));
        }
        return migrated;
    } catch (_error) {
        return [];
    }
}

export function writeCustomCapsules(capsules) {
    localStorage.setItem(CUSTOM_CAPSULES_KEY, JSON.stringify(capsules));
}

export function getCustomCapsuleById(capsuleId) {
    if (!capsuleId) return null;
    return readCustomCapsules().find((entry) => entry.id === capsuleId) || null;
}

export function getCustomCapsuleIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
}

export function getCustomCapsuleStoragePrefix(capsuleId) {
    return capsuleId ? `custom-capsule:${capsuleId}` : null;
}

export function deleteCustomCapsuleStorage(capsuleId, person) {
    const storagePrefix = getCustomCapsuleStoragePrefix(capsuleId);
    [
        `${storagePrefix}:uploaded-photos`,
        `${storagePrefix}:spotify-embed`,
        `${storagePrefix}:small-notes`,
        `${storagePrefix}:video-links`,
        `${storagePrefix}:open-when-pages`,
        `${storagePrefix}:theme-vars`,
        `photobooth:${person}`,
        `photobooth:draft:${person || "guest"}`
    ].forEach((key) => {
        if (key && !key.includes("null") && !key.includes("undefined")) {
            localStorage.removeItem(key);
        }
    });
}

export function getCapsuleStoragePrefix() {
    const customCapsuleId = getCustomCapsuleIdFromUrl();
    if (customCapsuleId) {
        return getCustomCapsuleStoragePrefix(customCapsuleId);
    }

    const capsulePath = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "");
    if (!capsulePath || capsulePath === "") return null;
    if (capsulePath === "/index.html" || capsulePath === "/") return null;
    if (!capsulePath.includes("/")) return null;
    return `capsule:${capsulePath}`;
}
