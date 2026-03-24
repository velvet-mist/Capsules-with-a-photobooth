import { getCapsuleStoragePrefix } from "../shared/custom-capsules.js";
import {
    createObjectFitImage,
    downscaleImage,
    readFileAsDataUrl,
    readJsonArrayStorage
} from "../shared/utils.js";

function normalizeSpotifyEmbedUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return "";

    if (value.includes("<iframe")) {
        const srcMatch = value.match(/src=["']([^"']+)["']/i);
        if (srcMatch && srcMatch[1]) {
            return normalizeSpotifyEmbedUrl(srcMatch[1]);
        }
    }

    let parsed;
    try {
        parsed = new URL(value);
    } catch (_error) {
        return "";
    }

    if (!parsed.hostname.includes("spotify.com")) return "";

    if (parsed.pathname.startsWith("/embed/")) {
        return `https://open.spotify.com${parsed.pathname}`;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const allowedTypes = new Set(["track", "album", "playlist", "episode", "show"]);
    if (parts.length < 2 || !allowedTypes.has(parts[0])) return "";

    return `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`;
}

function normalizeVideoEmbedUrl(rawValue) {
    const value = String(rawValue || "").trim();
    if (!value) return null;

    if (value.includes("<iframe")) {
        const srcMatch = value.match(/src=["']([^"']+)["']/i);
        if (srcMatch && srcMatch[1]) {
            return normalizeVideoEmbedUrl(srcMatch[1]);
        }
    }

    let parsed;
    try {
        parsed = new URL(value);
    } catch (_error) {
        return null;
    }

    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtube.com" || host === "m.youtube.com") {
        if (parsed.pathname === "/watch" && parsed.searchParams.get("v")) {
            return {
                embedUrl: `https://www.youtube.com/embed/${parsed.searchParams.get("v")}`,
                sourceUrl: parsed.toString()
            };
        }
        if (parsed.pathname.startsWith("/embed/")) {
            return { embedUrl: parsed.toString(), sourceUrl: parsed.toString() };
        }
    }

    if (host === "youtu.be") {
        const videoId = parsed.pathname.replace("/", "").trim();
        if (videoId) {
            return {
                embedUrl: `https://www.youtube.com/embed/${videoId}`,
                sourceUrl: parsed.toString()
            };
        }
    }

    if (host === "vimeo.com") {
        const clipId = parsed.pathname.replace("/", "").trim();
        if (clipId) {
            return {
                embedUrl: `https://player.vimeo.com/video/${clipId}`,
                sourceUrl: parsed.toString()
            };
        }
    }

    if (host === "player.vimeo.com" && parsed.pathname.startsWith("/video/")) {
        return { embedUrl: parsed.toString(), sourceUrl: parsed.toString() };
    }

    return { embedUrl: "", sourceUrl: parsed.toString() };
}

export function initCapsuleMediaEditing() {
    const storagePrefix = getCapsuleStoragePrefix();
    if (!storagePrefix) return;

    const photosSection = document.querySelector(".photos-section");
    if (photosSection) {
        const mediaGrid = photosSection.querySelector(".media-grid");
        const photoKey = `${storagePrefix}:uploaded-photos`;
        const defaultLimit = 12;

        let photos = [];
        try {
            const parsed = JSON.parse(localStorage.getItem(photoKey) || "[]");
            if (Array.isArray(parsed)) {
                photos = parsed.filter((entry) => entry && typeof entry.dataUrl === "string");
            }
        } catch (_error) {
            photos = [];
        }

        const controls = document.createElement("div");
        controls.className = "capsule-upload-controls";

        const uploadLabel = document.createElement("label");
        uploadLabel.className = "capsule-upload-label";
        uploadLabel.textContent = "Upload photos";

        const uploadInput = document.createElement("input");
        uploadInput.type = "file";
        uploadInput.accept = "image/*";
        uploadInput.multiple = true;

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "capsule-small-btn";
        clearBtn.textContent = "Clear All";

        const uploadHint = document.createElement("p");
        uploadHint.className = "capsule-upload-note";

        uploadLabel.appendChild(uploadInput);
        controls.append(uploadLabel, clearBtn, uploadHint);
        photosSection.appendChild(controls);

        function savePhotos() {
            localStorage.setItem(photoKey, JSON.stringify(photos));
        }

        function updateHint() {
            uploadHint.textContent = `${photos.length}/${defaultLimit} photo(s) saved on this device`;
        }

        function renderPhotos() {
            if (!mediaGrid) return;
            mediaGrid.innerHTML = "";

            if (!photos.length) {
                for (let i = 1; i <= 4; i += 1) {
                    const placeholder = document.createElement("div");
                    placeholder.className = "media-slot";
                    placeholder.textContent = `Photo Slot ${i}`;
                    mediaGrid.appendChild(placeholder);
                }
                updateHint();
                return;
            }

            photos.forEach((entry, index) => {
                const item = document.createElement("div");
                item.className = "media-slot media-slot-filled";

                const image = createObjectFitImage(entry.dataUrl, entry.name || `Photo ${index + 1}`);
                const nameInput = document.createElement("input");
                nameInput.type = "text";
                nameInput.className = "media-name-input";
                nameInput.value = entry.name || `photo-${index + 1}.jpg`;
                nameInput.placeholder = "Rename file";

                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "capsule-small-btn";
                removeBtn.textContent = "Remove";

                nameInput.addEventListener("input", () => {
                    photos[index].name = nameInput.value.trim() || `photo-${index + 1}.jpg`;
                    savePhotos();
                });

                removeBtn.addEventListener("click", () => {
                    photos.splice(index, 1);
                    savePhotos();
                    renderPhotos();
                });

                item.append(image, nameInput, removeBtn);
                mediaGrid.appendChild(item);
            });

            updateHint();
        }

        uploadInput.addEventListener("change", async (event) => {
            const files = Array.from(event.target.files || []);
            if (!files.length) return;

            const roomLeft = Math.max(0, defaultLimit - photos.length);
            const selected = files.slice(0, roomLeft);

            for (const file of selected) {
                const dataUrl = await readFileAsDataUrl(file);
                const optimized = await downscaleImage(dataUrl);
                photos.push({
                    name: file.name || `photo-${photos.length + 1}.jpg`,
                    dataUrl: optimized
                });
            }

            savePhotos();
            renderPhotos();
            event.target.value = "";
        });

        clearBtn.addEventListener("click", () => {
            photos = [];
            savePhotos();
            renderPhotos();
        });

        renderPhotos();
    }

    const musicSection = document.querySelector(".music-section");
    if (musicSection) {
        const musicFrame = musicSection.querySelector(".music-player");
        const musicKey = `${storagePrefix}:spotify-embed`;
        const defaultSrc = musicFrame ? musicFrame.src : "";

        const musicControls = document.createElement("div");
        musicControls.className = "capsule-upload-controls music-controls";

        const musicInput = document.createElement("input");
        musicInput.type = "text";
        musicInput.className = "spotify-input";
        musicInput.placeholder = "Paste Spotify song/playlist/album link or embed code";

        const saveMusicBtn = document.createElement("button");
        saveMusicBtn.type = "button";
        saveMusicBtn.className = "capsule-small-btn";
        saveMusicBtn.textContent = "Set Spotify Embed";

        const resetMusicBtn = document.createElement("button");
        resetMusicBtn.type = "button";
        resetMusicBtn.className = "capsule-small-btn";
        resetMusicBtn.textContent = "Reset";

        const musicNote = document.createElement("p");
        musicNote.className = "capsule-upload-note";
        musicNote.textContent = "Spotify link is saved for this capsule on this device.";

        musicControls.append(musicInput, saveMusicBtn, resetMusicBtn, musicNote);
        musicSection.appendChild(musicControls);

        function applyMusic(src) {
            if (!musicFrame) return;
            musicFrame.src = src || defaultSrc;
        }

        const savedSrc = localStorage.getItem(musicKey);
        if (savedSrc) {
            applyMusic(savedSrc);
            musicInput.value = savedSrc;
        }

        saveMusicBtn.addEventListener("click", () => {
            const normalized = normalizeSpotifyEmbedUrl(musicInput.value);
            if (!normalized) {
                musicNote.textContent = "Invalid Spotify link. Paste a valid Spotify URL or iframe code.";
                return;
            }

            localStorage.setItem(musicKey, normalized);
            applyMusic(normalized);
            musicInput.value = normalized;
            musicNote.textContent = "Spotify embed updated.";
        });

        resetMusicBtn.addEventListener("click", () => {
            localStorage.removeItem(musicKey);
            musicInput.value = "";
            applyMusic(defaultSrc);
            musicNote.textContent = "Spotify embed reset to default.";
        });
    }

    const notesSection = document.querySelector(".notes-section");
    if (notesSection) {
        const notesTextarea = notesSection.querySelector(".note-input");
        const notesKey = `${storagePrefix}:small-notes`;
        let notes = readJsonArrayStorage(notesKey).filter((entry) => entry && typeof entry.text === "string");

        const notesControls = document.createElement("div");
        notesControls.className = "capsule-upload-controls";

        const addNoteBtn = document.createElement("button");
        addNoteBtn.type = "button";
        addNoteBtn.className = "capsule-small-btn";
        addNoteBtn.textContent = "Add Note";

        const notesList = document.createElement("div");
        notesList.className = "note-entry-list";

        const notesHint = document.createElement("p");
        notesHint.className = "capsule-upload-note";
        notesHint.textContent = "Save short notes for this capsule.";

        notesControls.append(addNoteBtn, notesHint, notesList);
        notesSection.appendChild(notesControls);

        function saveNotes() {
            localStorage.setItem(notesKey, JSON.stringify(notes));
        }

        function renderNotes() {
            notesList.innerHTML = "";
            if (!notes.length) {
                const empty = document.createElement("p");
                empty.className = "capsule-upload-note";
                empty.textContent = "No saved notes yet.";
                notesList.appendChild(empty);
                return;
            }

            notes.forEach((entry, index) => {
                const row = document.createElement("div");
                row.className = "note-entry-row";

                const text = document.createElement("p");
                text.className = "note-entry-text";
                text.textContent = entry.text;

                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "capsule-small-btn";
                removeBtn.textContent = "Delete";
                removeBtn.addEventListener("click", () => {
                    notes.splice(index, 1);
                    saveNotes();
                    renderNotes();
                });

                row.append(text, removeBtn);
                notesList.appendChild(row);
            });
        }

        addNoteBtn.addEventListener("click", () => {
            if (!notesTextarea) return;
            const text = notesTextarea.value.trim();
            if (!text) {
                notesHint.textContent = "Write a note first.";
                return;
            }

            notes.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                text
            });
            saveNotes();
            notesTextarea.value = "";
            notesHint.textContent = "Note added.";
            renderNotes();
        });

        renderNotes();
    }

    const videosSection = document.querySelector(".videos-section");
    if (videosSection) {
        const videoSlot = videosSection.querySelector(".video-slot");
        const videosKey = `${storagePrefix}:video-links`;
        let videos = readJsonArrayStorage(videosKey).filter((entry) => entry && typeof entry.sourceUrl === "string");

        const videoControls = document.createElement("div");
        videoControls.className = "capsule-upload-controls";

        const videoTitleInput = document.createElement("input");
        videoTitleInput.type = "text";
        videoTitleInput.className = "spotify-input";
        videoTitleInput.placeholder = "Video title (optional)";

        const videoUrlInput = document.createElement("input");
        videoUrlInput.type = "text";
        videoUrlInput.className = "spotify-input";
        videoUrlInput.placeholder = "Paste YouTube/Vimeo link or iframe code";

        const addVideoBtn = document.createElement("button");
        addVideoBtn.type = "button";
        addVideoBtn.className = "capsule-small-btn";
        addVideoBtn.textContent = "Add Video";

        const videoList = document.createElement("div");
        videoList.className = "video-entry-list";

        const videoHint = document.createElement("p");
        videoHint.className = "capsule-upload-note";
        videoHint.textContent = "Add a few videos to your capsule.";

        videoControls.append(videoTitleInput, videoUrlInput, addVideoBtn, videoHint);
        videosSection.append(videoControls, videoList);

        function saveVideos() {
            localStorage.setItem(videosKey, JSON.stringify(videos));
        }

        function renderVideos() {
            videoList.innerHTML = "";
            if (videoSlot) {
                videoSlot.style.display = videos.length ? "none" : "grid";
            }

            if (!videos.length) {
                const empty = document.createElement("p");
                empty.className = "capsule-upload-note";
                empty.textContent = "No videos added yet.";
                videoList.appendChild(empty);
                return;
            }

            videos.forEach((entry, index) => {
                const item = document.createElement("div");
                item.className = "video-entry-card";

                const title = document.createElement("p");
                title.className = "video-entry-title";
                title.textContent = entry.title || `Video ${index + 1}`;
                item.appendChild(title);

                if (entry.embedUrl) {
                    const frame = document.createElement("iframe");
                    frame.className = "video-embed-frame";
                    frame.src = entry.embedUrl;
                    frame.loading = "lazy";
                    frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
                    frame.referrerPolicy = "strict-origin-when-cross-origin";
                    item.appendChild(frame);
                } else {
                    const link = document.createElement("a");
                    link.href = entry.sourceUrl;
                    link.target = "_blank";
                    link.rel = "noreferrer noopener";
                    link.className = "video-entry-link";
                    link.textContent = "Open video link";
                    item.appendChild(link);
                }

                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "capsule-small-btn";
                removeBtn.textContent = "Delete";
                removeBtn.addEventListener("click", () => {
                    videos.splice(index, 1);
                    saveVideos();
                    renderVideos();
                });

                item.appendChild(removeBtn);
                videoList.appendChild(item);
            });
        }

        addVideoBtn.addEventListener("click", () => {
            const normalized = normalizeVideoEmbedUrl(videoUrlInput.value);
            if (!normalized || !normalized.sourceUrl) {
                videoHint.textContent = "Invalid video input.";
                return;
            }

            videos.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                title: videoTitleInput.value.trim(),
                sourceUrl: normalized.sourceUrl,
                embedUrl: normalized.embedUrl
            });
            saveVideos();
            renderVideos();
            videoTitleInput.value = "";
            videoUrlInput.value = "";
            videoHint.textContent = "Video added.";
        });

        renderVideos();
    }

    const lettersSection = document.querySelector(".letters-section");
    if (lettersSection) {
        const lettersKey = `${storagePrefix}:open-when-pages`;
        let letters = readJsonArrayStorage(lettersKey).filter(
            (entry) => entry && typeof entry.title === "string" && typeof entry.body === "string"
        );

        const existingPromptList = lettersSection.querySelector(".prompt-list");
        if (existingPromptList) {
            existingPromptList.style.display = "none";
        }

        const controls = document.createElement("div");
        controls.className = "capsule-upload-controls";

        const triggerInput = document.createElement("input");
        triggerInput.type = "text";
        triggerInput.className = "spotify-input";
        triggerInput.placeholder = "Open when... (example: you feel low)";

        const bodyInput = document.createElement("textarea");
        bodyInput.className = "note-input open-when-input";
        bodyInput.placeholder = "Write the letter page here...";

        const addPageBtn = document.createElement("button");
        addPageBtn.type = "button";
        addPageBtn.className = "capsule-small-btn";
        addPageBtn.textContent = "Add Open-When Page";

        const hint = document.createElement("p");
        hint.className = "capsule-upload-note";
        hint.textContent = "Create multiple open-when pages.";

        const list = document.createElement("div");
        list.className = "open-when-list";

        controls.append(triggerInput, bodyInput, addPageBtn, hint);
        lettersSection.append(controls, list);

        const modal = document.createElement("div");
        modal.className = "open-when-modal";
        modal.innerHTML = `
            <div class="open-when-modal-card">
                <button type="button" class="capsule-small-btn modal-close-btn">Close</button>
                <h3 class="open-when-modal-title"></h3>
                <p class="open-when-modal-body"></p>
            </div>
        `;
        document.body.appendChild(modal);

        const modalTitle = modal.querySelector(".open-when-modal-title");
        const modalBody = modal.querySelector(".open-when-modal-body");
        const closeModalBtn = modal.querySelector(".modal-close-btn");

        function closeModal() {
            modal.classList.remove("open");
        }

        function openModal(entry) {
            modalTitle.textContent = `Open when ${entry.title}`;
            modalBody.textContent = entry.body;
            modal.classList.add("open");
        }

        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                closeModal();
            }
        });
        closeModalBtn.addEventListener("click", closeModal);

        function saveLetters() {
            localStorage.setItem(lettersKey, JSON.stringify(letters));
        }

        function renderLetters() {
            list.innerHTML = "";
            if (!letters.length) {
                const empty = document.createElement("p");
                empty.className = "capsule-upload-note";
                empty.textContent = "No open-when pages yet.";
                list.appendChild(empty);
                return;
            }

            letters.forEach((entry, index) => {
                const row = document.createElement("div");
                row.className = "open-when-item";

                const title = document.createElement("p");
                title.className = "open-when-item-title";
                title.textContent = `Open when ${entry.title}`;

                const actions = document.createElement("div");
                actions.className = "open-when-item-actions";

                const openBtn = document.createElement("button");
                openBtn.type = "button";
                openBtn.className = "capsule-small-btn";
                openBtn.textContent = "Open Page";
                openBtn.addEventListener("click", () => openModal(entry));

                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.className = "capsule-small-btn";
                removeBtn.textContent = "Delete";
                removeBtn.addEventListener("click", () => {
                    letters.splice(index, 1);
                    saveLetters();
                    renderLetters();
                });

                actions.append(openBtn, removeBtn);
                row.append(title, actions);
                list.appendChild(row);
            });
        }

        addPageBtn.addEventListener("click", () => {
            const title = triggerInput.value.trim();
            const body = bodyInput.value.trim();
            if (!title || !body) {
                hint.textContent = "Add both trigger and page content.";
                return;
            }

            letters.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                title,
                body
            });
            saveLetters();
            renderLetters();
            triggerInput.value = "";
            bodyInput.value = "";
            hint.textContent = "Open-when page added.";
        });

        renderLetters();
    }

    const pageHeader = document.querySelector(".page-header");
    if (pageHeader) {
        const themeKey = `${storagePrefix}:theme-vars`;
        const rootStyle = document.documentElement.style;
        const computedStyle = getComputedStyle(document.documentElement);
        const themeVars = [
            "--bg-start",
            "--bg-end",
            "--bg-glow",
            "--panel-bg",
            "--panel-border",
            "--chip-bg",
            "--text",
            "--muted"
        ];
        const defaultTheme = {};
        themeVars.forEach((key) => {
            defaultTheme[key] = computedStyle.getPropertyValue(key).trim();
        });

        const presets = {
            default: defaultTheme,
            sunset: {
                "--bg-start": "#4a1d12",
                "--bg-end": "#a84b2f",
                "--bg-glow": "rgba(255, 200, 150, 0.30)",
                "--panel-bg": "rgba(84, 36, 23, 0.72)",
                "--panel-border": "rgba(255, 200, 150, 0.40)",
                "--chip-bg": "rgba(255, 200, 150, 0.18)",
                "--text": "#fff4e8",
                "--muted": "#f2d2bc"
            },
            ocean: {
                "--bg-start": "#0e2436",
                "--bg-end": "#1f4f6a",
                "--bg-glow": "rgba(162, 215, 255, 0.30)",
                "--panel-bg": "rgba(18, 44, 62, 0.72)",
                "--panel-border": "rgba(162, 215, 255, 0.40)",
                "--chip-bg": "rgba(162, 215, 255, 0.18)",
                "--text": "#f0f9ff",
                "--muted": "#c7e7f5"
            },
            forest: {
                "--bg-start": "#11251a",
                "--bg-end": "#2d5b41",
                "--bg-glow": "rgba(189, 239, 183, 0.30)",
                "--panel-bg": "rgba(24, 50, 36, 0.74)",
                "--panel-border": "rgba(189, 239, 183, 0.40)",
                "--chip-bg": "rgba(189, 239, 183, 0.18)",
                "--text": "#f2faef",
                "--muted": "#cee7c8"
            },
            lilac: {
                "--bg-start": "#2f1f45",
                "--bg-end": "#5b3f7f",
                "--bg-glow": "rgba(228, 196, 255, 0.30)",
                "--panel-bg": "rgba(56, 36, 85, 0.74)",
                "--panel-border": "rgba(228, 196, 255, 0.40)",
                "--chip-bg": "rgba(228, 196, 255, 0.18)",
                "--text": "#faf3ff",
                "--muted": "#e5d4f0"
            }
        };

        function applyTheme(themeObject) {
            themeVars.forEach((key) => {
                if (themeObject[key]) {
                    rootStyle.setProperty(key, themeObject[key]);
                }
            });
        }

        const pickerCard = document.createElement("section");
        pickerCard.className = "hero theme-picker-card";
        pickerCard.innerHTML = `
            <p class="kicker">Capsule Theme</p>
            <div class="theme-picker-row">
                <select class="theme-picker-select">
                    <option value="default">Default</option>
                    <option value="sunset">Sunset</option>
                    <option value="ocean">Ocean</option>
                    <option value="forest">Forest</option>
                    <option value="lilac">Lilac</option>
                </select>
                <button type="button" class="capsule-small-btn apply-theme-btn">Apply Theme</button>
                <button type="button" class="capsule-small-btn reset-theme-btn">Reset</button>
            </div>
        `;
        pageHeader.appendChild(pickerCard);

        const themeSelect = pickerCard.querySelector(".theme-picker-select");
        const applyThemeBtn = pickerCard.querySelector(".apply-theme-btn");
        const resetThemeBtn = pickerCard.querySelector(".reset-theme-btn");

        const savedTheme = localStorage.getItem(themeKey);
        if (savedTheme) {
            try {
                const parsedTheme = JSON.parse(savedTheme);
                applyTheme(parsedTheme);
            } catch (_error) {
                localStorage.removeItem(themeKey);
            }
        }

        applyThemeBtn.addEventListener("click", () => {
            const selected = themeSelect.value;
            const themeObject = presets[selected] || presets.default;
            applyTheme(themeObject);
            localStorage.setItem(themeKey, JSON.stringify(themeObject));
        });

        resetThemeBtn.addEventListener("click", () => {
            applyTheme(defaultTheme);
            themeSelect.value = "default";
            localStorage.removeItem(themeKey);
        });
    }
}
