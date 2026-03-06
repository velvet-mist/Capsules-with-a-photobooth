function goBack() {
    if (window.history.length > 1) {
        window.history.back();
        return;
    }

    const fallback = new URL("../index.html", window.location.href);
    window.location.href = fallback.href;
}

function getPhotoboothPersonFromLink(link) {
    if (!link) return "guest";
    const url = new URL(link.getAttribute("href"), window.location.href);
    return url.searchParams.get("person") || "guest";
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function downscaleImage(dataUrl, maxSize = 1200, quality = 0.86) {
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

function initPhotoboothUploadBridge() {
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

initPhotoboothUploadBridge();

function initHomePageFeatures() {
    const cardGrid = document.querySelector("#cardGrid");
    if (!cardGrid) return;

    const cards = () => Array.from(cardGrid.querySelectorAll(".card"));
    const randomCapsuleBtn = document.querySelector("#randomCapsuleBtn");
    const shuffleCardsBtn = document.querySelector("#shuffleCardsBtn");
    const promptBtn = document.querySelector("#promptBtn");
    const memoryPrompt = document.querySelector("#memoryPrompt");
    const capsuleCount = document.querySelector("#capsuleCount");
    const todayDate = document.querySelector("#todayDate");
    const revealNoteBtn = document.querySelector("#revealNoteBtn");
    const jarNote = document.querySelector("#jarNote");
    const jarCount = document.querySelector("#jarCount");
    const jarSparkArea = document.querySelector("#jarSparkArea");

    const prompts = [
        "Pick one song that reminds you of everyone in this gift.",
        "Write one line about a moment you never want to forget.",
        "Open a random capsule and add one new photo today.",
        "Which person here made you laugh the most this month?",
        "Create a tiny voice note for your future self."
    ];
    const jarNotes = [
        "One old photo. One old song. One full smile.",
        "Remember the day plans changed but the fun did not?",
        "Save one random voice note today for future-you.",
        "A tiny memory can still hold a whole evening.",
        "Revisit one message thread and pick your favorite line.",
        "If this moment had a soundtrack, what would play first?"
    ];
    const jarCountKey = "home:memory-jar-count";

    if (capsuleCount) {
        capsuleCount.textContent = String(cards().length);
    }

    if (todayDate) {
        todayDate.textContent = new Intl.DateTimeFormat("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(new Date());
    }

    if (randomCapsuleBtn) {
        randomCapsuleBtn.addEventListener("click", () => {
            const list = cards();
            if (!list.length) return;
            const target = list[Math.floor(Math.random() * list.length)];
            window.location.href = target.href;
        });
    }

    if (shuffleCardsBtn) {
        shuffleCardsBtn.addEventListener("click", () => {
            const shuffled = cards().sort(() => Math.random() - 0.5);
            shuffled.forEach((card) => cardGrid.appendChild(card));
        });
    }

    if (promptBtn && memoryPrompt) {
        promptBtn.addEventListener("click", () => {
            const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
            memoryPrompt.textContent = randomPrompt;
        });
    }

    if (jarCount) {
        jarCount.textContent = localStorage.getItem(jarCountKey) || "0";
    }

    if (revealNoteBtn && jarNote) {
        revealNoteBtn.addEventListener("click", () => {
            const randomNote = jarNotes[Math.floor(Math.random() * jarNotes.length)];
            jarNote.textContent = randomNote;

            const current = Number(localStorage.getItem(jarCountKey) || "0") + 1;
            localStorage.setItem(jarCountKey, String(current));
            if (jarCount) jarCount.textContent = String(current);

            if (jarSparkArea) {
                for (let i = 0; i < 8; i += 1) {
                    const spark = document.createElement("span");
                    spark.className = "jar-spark";
                    spark.style.setProperty("--spark-left", `${12 + Math.random() * 76}%`);
                    spark.style.animationDelay = `${Math.random() * 120}ms`;
                    jarSparkArea.appendChild(spark);
                    setTimeout(() => spark.remove(), 900);
                }
            }
        });
    }
}

initHomePageFeatures();
