import { readFileAsDataUrl, downscaleImage } from "../shared/utils.js";

function getPhotoboothPersonFromLink(link) {
    if (!link) return "guest";
    const url = new URL(link.getAttribute("href"), window.location.href);
    return url.searchParams.get("person") || "guest";
}

export function initPhotoboothUploadBridge() {
    const sections = Array.from(document.querySelectorAll(".photobooth-section"));
    if (!sections.length) return;

    sections.forEach((section) => {
        const link = section.querySelector(".photobooth-btn");
        const person = getPhotoboothPersonFromLink(link);
        const storageKey = `photobooth:${person}`;

        const uploaderLabel = document.createElement("label");
        uploaderLabel.className = "photobooth-upload";
        uploaderLabel.textContent = "Add Photos For Photobooth";

        const uploader = document.createElement("input");
        uploader.type = "file";
        uploader.accept = "image/*";
        uploader.multiple = true;

        const helper = document.createElement("p");
        helper.className = "photobooth-upload-note";
        helper.textContent = "These photos will be available in photobooth drag-and-drop.";

        const counter = document.createElement("p");
        counter.className = "photobooth-upload-count";

        function refreshCounter() {
            const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
            counter.textContent = `${saved.length} photo(s) saved`;
        }

        uploader.addEventListener("change", async (event) => {
            const files = Array.from(event.target.files || []);
            if (!files.length) return;

            let saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
            const roomLeft = Math.max(0, 12 - saved.length);
            const selected = files.slice(0, roomLeft);

            for (const file of selected) {
                const dataUrl = await readFileAsDataUrl(file);
                const optimized = await downscaleImage(dataUrl);
                saved.push(optimized);
            }

            localStorage.setItem(storageKey, JSON.stringify(saved));
            event.target.value = "";
            refreshCounter();
        });

        uploaderLabel.appendChild(uploader);
        section.appendChild(uploaderLabel);
        section.appendChild(helper);
        section.appendChild(counter);
        refreshCounter();
    });
}
