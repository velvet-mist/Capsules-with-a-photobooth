import {
    getCustomCapsuleIdFromUrl,
    getCustomCapsuleById,
    readCustomCapsules,
    writeCustomCapsules,
    deleteCustomCapsuleStorage
} from "../shared/custom-capsules.js";
import { initBackButtons } from "../shared/navigation.js";

export function initCustomCapsulePage() {
    const customPage = document.querySelector("[data-custom-capsule-page='1']");
    if (!customPage) return;

    const capsuleId = getCustomCapsuleIdFromUrl();
    const capsule = getCustomCapsuleById(capsuleId);

    if (!capsule) {
        const header = document.createElement("header");
        header.className = "page-header";

        const backButton = document.createElement("button");
        backButton.className = "back-btn";
        backButton.type = "button";
        backButton.dataset.goBack = "1";
        backButton.textContent = "Back";
        header.appendChild(backButton);

        const emptyState = document.createElement("section");
        emptyState.className = "card custom-empty-state";

        const heading = document.createElement("h2");
        heading.textContent = "Capsule not found";

        const message = document.createElement("p");
        message.textContent = "This custom capsule was deleted or never existed on this device.";

        emptyState.append(heading, message);
        customPage.replaceChildren(header, emptyState);
        document.title = "Missing Capsule";
        initBackButtons(customPage);
        return;
    }

    document.title = `${capsule.name} | Capsule`;

    const title = customPage.querySelector("[data-custom-capsule-name]");
    const tagline = customPage.querySelector("[data-custom-capsule-tagline]");
    const cover = customPage.querySelector("[data-custom-capsule-cover]");
    const photoboothBtn = customPage.querySelector(".photobooth-btn");
    const deleteBtn = customPage.querySelector("[data-delete-custom-capsule]");

    if (title) title.textContent = capsule.name;
    if (tagline) tagline.textContent = `A custom memory capsule for ${capsule.name}.`;
    if (cover) {
        if (capsule.photoDataUrl) {
            cover.src = capsule.photoDataUrl;
            cover.alt = `${capsule.name} cover`;
            cover.hidden = false;
        } else {
            cover.hidden = true;
        }
    }
    if (photoboothBtn) {
        photoboothBtn.href =
            `photobooth/index.html?person=${encodeURIComponent(capsule.person)}` +
            `&caption=${encodeURIComponent(`${capsule.name}'s Booth`)}`;
    }
    if (deleteBtn) {
        deleteBtn.addEventListener("click", () => {
            if (!confirm(`Delete ${capsule.name}'s custom capsule?`)) return;
            const nextCapsules = readCustomCapsules().filter((entry) => entry.id !== capsule.id);
            writeCustomCapsules(nextCapsules);
            deleteCustomCapsuleStorage(capsule.id, capsule.person);
            window.location.href = "index.html";
        });
    }
}
