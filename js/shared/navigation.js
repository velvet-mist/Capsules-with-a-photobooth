export function goBack() {
    if (window.history.length > 1) {
        window.history.back();
        return;
    }

    const fallbackPath = document.body?.dataset?.homeFallback || "../index.html";
    const fallback = new URL(fallbackPath, window.location.href);
    window.location.href = fallback.href;
}

export function initBackButtons(root = document) {
    root.querySelectorAll("[data-go-back]").forEach((button) => {
        if (button.dataset.backBound === "1") return;
        button.dataset.backBound = "1";
        button.addEventListener("click", goBack);
    });
}
