export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function downscaleImage(dataUrl, maxSize = 1200, quality = 0.86) {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
            const width = Math.round(image.width * scale);
            const height = Math.round(image.height * scale);

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        image.src = dataUrl;
    });
}

export function extractToken(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
        const parsed = new URL(raw);
        return parsed.searchParams.get("token") || raw;
    } catch (_error) {
        return raw;
    }
}

export function getSafeReturnTo() {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo") || "";
    if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return "";
    return returnTo;
}

export function readJsonArrayStorage(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

export function slugifyCapsuleName(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
}

export function createObjectFitImage(src, altText) {
    const image = document.createElement("img");
    image.src = src;
    image.alt = altText || "Uploaded photo";
    image.loading = "lazy";
    image.className = "uploaded-media-image";
    return image;
}
