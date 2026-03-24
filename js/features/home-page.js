import { apiRequest, setStoredAuthToken } from "../shared/api.js";
import { AUTH_TOKEN_KEY, CUSTOM_CAPSULE_PAGE_PATH } from "../shared/constants.js";
import {
    deleteCustomCapsuleStorage,
    readCustomCapsules,
    writeCustomCapsules
} from "../shared/custom-capsules.js";
import {
    downscaleImage,
    extractToken,
    getSafeReturnTo,
    readFileAsDataUrl,
    slugifyCapsuleName
} from "../shared/utils.js";

let homeCurrentUser = null;

async function loadCapsules() {
    try {
        const response = await fetch("capsules.json");
        let capsules = await response.json();
        const overridesKey = "capsules:overrides";
        const overrides = JSON.parse(localStorage.getItem(overridesKey) || "{}");
        capsules = capsules.map((capsule) => ({ ...capsule, ...overrides[capsule.id] }));
        return capsules.filter((capsule) => capsule.active !== false);
    } catch (error) {
        console.warn("Failed to load capsules.json:", error);
        return [];
    }
}

function renderDynamicGrid(capsules, cardGrid) {
    cardGrid.innerHTML = "";
    capsules.forEach((capsule) => {
        const card = document.createElement("a");
        const cardName = document.createElement("span");
        const cardMeta = document.createElement("span");

        card.className = "card";
        card.href = `${capsule.dir}/${capsule.slug || capsule.id}.html`;
        cardName.className = "card-name";
        cardName.textContent = capsule.name;
        cardMeta.className = "card-meta";
        cardMeta.textContent = "Open Capsule";

        card.append(cardName, cardMeta);
        cardGrid.appendChild(card);
    });
}

export function initHomePageFeatures() {
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
    const createCapsuleForm = document.querySelector("#createCapsuleForm");
    const capsuleNameInput = document.querySelector("#capsuleNameInput");
    const capsulePhotoInput = document.querySelector("#capsulePhotoInput");
    const createCapsuleMsg = document.querySelector("#createCapsuleMsg");
    const createCapsulePanel = document.querySelector(".create-capsule-panel");
    const authNameInput = document.querySelector("#authName");
    const authEmailInput = document.querySelector("#authEmail");
    const authPasswordInput = document.querySelector("#authPassword");
    const authTokenInput = document.querySelector("#authTokenInput");
    const newPasswordInput = document.querySelector("#newPasswordInput");
    const signupBtn = document.querySelector("#signupBtn");
    const loginBtn = document.querySelector("#loginBtn");
    const logoutBtn = document.querySelector("#logoutBtn");
    const resendVerifyBtn = document.querySelector("#resendVerifyBtn");
    const requestResetBtn = document.querySelector("#requestResetBtn");
    const verifyTokenBtn = document.querySelector("#verifyTokenBtn");
    const resetPasswordBtn = document.querySelector("#resetPasswordBtn");
    const authStatus = document.querySelector("#authStatus");
    let manageList = null;

    function setAuthStatus(message) {
        if (authStatus) authStatus.textContent = message || "";
    }

    function setCreateCapsuleEnabled(isEnabled) {
        if (!createCapsuleForm) return;
        Array.from(createCapsuleForm.elements).forEach((field) => {
            field.disabled = !isEnabled;
        });
    }

    function redirectAfterAuth() {
        const returnTo = getSafeReturnTo();
        if (returnTo) window.location.href = returnTo;
    }

    function updateHomeAuthUI() {
        if (homeCurrentUser) {
            const verifyState = homeCurrentUser.emailVerified ? "verified" : "not verified";
            setAuthStatus(`Signed in as ${homeCurrentUser.email} (${verifyState})`);
        } else {
            setAuthStatus("Sign in to start making a capsule for someone else.");
        }

        if (signupBtn) signupBtn.disabled = Boolean(homeCurrentUser);
        if (loginBtn) loginBtn.disabled = Boolean(homeCurrentUser);
        if (logoutBtn) logoutBtn.disabled = !homeCurrentUser;
        if (resendVerifyBtn) resendVerifyBtn.disabled = !homeCurrentUser;
        setCreateCapsuleEnabled(Boolean(homeCurrentUser));

        if (createCapsuleMsg) {
            createCapsuleMsg.textContent = homeCurrentUser
                ? "You are signed in. Create a capsule for someone else below."
                : "Sign in above first, then create a capsule for someone else.";
        }
    }

    async function restoreHomeSession() {
        const token = localStorage.getItem(AUTH_TOKEN_KEY) || "";
        if (!token) {
            updateHomeAuthUI();
            return;
        }

        try {
            const data = await apiRequest("/auth/me");
            homeCurrentUser = data.user;
        } catch (_error) {
            setStoredAuthToken("");
            homeCurrentUser = null;
        }
        updateHomeAuthUI();
    }

    async function signup() {
        const name = authNameInput?.value.trim() || "";
        const email = authEmailInput?.value.trim() || "";
        const password = authPasswordInput?.value || "";
        if (!email || !password) {
            setAuthStatus("Email and password are required.");
            return;
        }

        const data = await apiRequest("/auth/signup", {
            method: "POST",
            body: { name, email, password }
        });

        setStoredAuthToken(data.token);
        homeCurrentUser = data.user;
        if (authTokenInput && data.verificationPlaceholderUrl) {
            authTokenInput.value = data.verificationPlaceholderUrl;
        }
        updateHomeAuthUI();
        if (homeCurrentUser.emailVerified) redirectAfterAuth();
    }

    async function login() {
        const email = authEmailInput?.value.trim() || "";
        const password = authPasswordInput?.value || "";
        if (!email || !password) {
            setAuthStatus("Email and password are required.");
            return;
        }

        const data = await apiRequest("/auth/login", {
            method: "POST",
            body: { email, password }
        });

        setStoredAuthToken(data.token);
        homeCurrentUser = data.user;
        updateHomeAuthUI();
        if (homeCurrentUser.emailVerified) redirectAfterAuth();
    }

    function logout() {
        setStoredAuthToken("");
        homeCurrentUser = null;
        updateHomeAuthUI();
    }

    async function requestEmailVerification() {
        const email = authEmailInput?.value.trim() || "";
        const data = await apiRequest("/auth/request-email-verification", {
            method: "POST",
            body: { email }
        });

        if (authTokenInput && data.verificationPlaceholderUrl) {
            authTokenInput.value = data.verificationPlaceholderUrl;
        }
        setAuthStatus("Verification link generated. Open or paste it here to verify.");
    }

    async function verifyEmailWithToken() {
        const token = extractToken(authTokenInput?.value || "");
        if (!token) {
            setAuthStatus("Paste a verification link or token first.");
            return;
        }

        await apiRequest("/auth/verify-email", {
            method: "POST",
            body: { token }
        });

        const storedToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
        if (storedToken) {
            const data = await apiRequest("/auth/me");
            homeCurrentUser = data.user;
        }
        updateHomeAuthUI();
        const params = new URLSearchParams(window.location.search);
        params.delete("token");
        params.delete("mode");
        const nextUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, "");
        window.history.replaceState({}, "", nextUrl || window.location.pathname);
        redirectAfterAuth();
    }

    async function requestPasswordReset() {
        const email = authEmailInput?.value.trim() || "";
        if (!email) {
            setAuthStatus("Enter your email first.");
            return;
        }

        const data = await apiRequest("/auth/request-password-reset", {
            method: "POST",
            body: { email }
        });

        if (authTokenInput && data.resetPlaceholderUrl) {
            authTokenInput.value = data.resetPlaceholderUrl;
        }
        setAuthStatus("Reset link generated. Paste it here and choose a new password.");
    }

    async function resetPasswordWithToken() {
        const token = extractToken(authTokenInput?.value || "");
        const newPassword = newPasswordInput?.value || "";
        if (!token || !newPassword) {
            setAuthStatus("Token and new password are required.");
            return;
        }

        await apiRequest("/auth/reset-password", {
            method: "POST",
            body: { token, newPassword }
        });

        if (newPasswordInput) newPasswordInput.value = "";
        setAuthStatus("Password reset. Sign in with the new password.");
    }

    function createNewCapsulePrompt() {
        if (!homeCurrentUser) {
            document.querySelector(".auth-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
            authEmailInput?.focus();
            setAuthStatus("Sign in first, then create the capsule.");
            return;
        }

        createCapsuleForm?.scrollIntoView({ behavior: "smooth", block: "center" });
        capsuleNameInput?.focus();
        if (createCapsuleMsg) {
            createCapsuleMsg.textContent = "Create a full custom capsule page below.";
        }
    }

    function renameCustomCapsule(capsuleId, nextName) {
        const trimmedName = String(nextName || "").trim();
        if (!trimmedName) return false;

        const customCapsules = readCustomCapsules();
        const target = customCapsules.find((entry) => entry.id === capsuleId);
        if (!target) return false;
        target.name = trimmedName;
        writeCustomCapsules(customCapsules);
        return true;
    }

    function deleteCustomCapsule(capsuleId) {
        const customCapsules = readCustomCapsules();
        const target = customCapsules.find((entry) => entry.id === capsuleId);
        const nextCapsules = customCapsules.filter((entry) => entry.id !== capsuleId);
        writeCustomCapsules(nextCapsules);
        if (target) deleteCustomCapsuleStorage(target.id, target.person);
    }

    function updateCapsuleCount() {
        if (capsuleCount) capsuleCount.textContent = String(cards().length);
    }

    function createCustomCapsuleCard(entry) {
        const card = document.createElement("a");
        card.className = "card custom-capsule";
        card.dataset.customCapsule = "1";
        card.href = `${CUSTOM_CAPSULE_PAGE_PATH}?id=${encodeURIComponent(entry.id)}`;

        const thumb = document.createElement("span");
        thumb.className = "card-thumb";
        if (entry.photoDataUrl) thumb.style.backgroundImage = `url("${entry.photoDataUrl}")`;
        else thumb.classList.add("empty");

        const name = document.createElement("span");
        name.className = "card-name";
        name.textContent = entry.name;

        const meta = document.createElement("span");
        meta.className = "card-meta";
        meta.textContent = "Open Capsule";

        card.append(thumb, name, meta);
        return card;
    }

    async function renderCapsuleManager() {
        if (!manageList) return;
        manageList.innerHTML = "";

        const addNewBtn = document.createElement("button");
        addNewBtn.className = "action-btn";
        addNewBtn.textContent = "Add New Fixed Capsule";
        addNewBtn.addEventListener("click", createNewCapsulePrompt);
        manageList.appendChild(addNewBtn);

        const fixedCapsules = await loadCapsules();
        fixedCapsules.forEach((entry) => {
            const row = document.createElement("div");
            row.className = "manage-capsule-row";
            row.dataset.capsuleType = "fixed";
            row.dataset.capsuleId = entry.id;

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.value = entry.name;
            nameInput.className = "manage-capsule-input";

            const themeSelect = document.createElement("select");
            ["default", "sunset", "ocean", "forest", "lilac"].forEach((theme) => {
                const option = document.createElement("option");
                option.value = theme;
                option.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
                themeSelect.appendChild(option);
            });
            themeSelect.value = entry.theme || "default";

            const saveBtn = document.createElement("button");
            saveBtn.className = "manage-btn";
            saveBtn.textContent = "Save";

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "manage-btn danger";
            deleteBtn.textContent = "Delete";

            saveBtn.addEventListener("click", () => saveCapsuleOverride(entry.id, nameInput.value, themeSelect.value));
            deleteBtn.addEventListener("click", () => deleteCapsule(entry.id));

            row.append(nameInput, themeSelect, saveBtn, deleteBtn);
            manageList.appendChild(row);
        });

        const customCapsules = readCustomCapsules();
        customCapsules.forEach((entry) => {
            const row = document.createElement("div");
            row.className = "manage-capsule-row";
            row.dataset.capsuleType = "custom";
            row.dataset.capsuleId = entry.id;

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.value = entry.name;
            nameInput.className = "manage-capsule-input";

            const saveBtn = document.createElement("button");
            saveBtn.className = "manage-btn";
            saveBtn.textContent = "Save";

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "manage-btn danger";
            deleteBtn.textContent = "Delete";

            saveBtn.addEventListener("click", () => {
                renameCustomCapsule(entry.id, nameInput.value);
                renderCustomCapsules();
                renderCapsuleManager();
            });
            deleteBtn.addEventListener("click", () => {
                if (!confirm(`Delete ${entry.name}'s custom capsule?`)) return;
                deleteCustomCapsule(entry.id);
                renderCustomCapsules();
                renderCapsuleManager();
            });

            row.append(nameInput, saveBtn, deleteBtn);
            manageList.appendChild(row);
        });

        if (!fixedCapsules.length && !customCapsules.length) {
            const empty = document.createElement("p");
            empty.className = "create-capsule-msg";
            empty.textContent = "No capsules yet.";
            manageList.appendChild(empty);
        }
    }

    function renderCustomCapsules() {
        const oldCards = Array.from(cardGrid.querySelectorAll("[data-custom-capsule='1']"));
        oldCards.forEach((card) => card.remove());

        readCustomCapsules().forEach((entry) => {
            cardGrid.appendChild(createCustomCapsuleCard(entry));
        });
        updateCapsuleCount();
        renderCapsuleManager();
    }

    function saveCapsuleOverride(id, name, theme) {
        const overridesKey = "capsules:overrides";
        const overrides = JSON.parse(localStorage.getItem(overridesKey) || "{}");
        overrides[id] = { name, theme };
        localStorage.setItem(overridesKey, JSON.stringify(overrides));
        loadCapsules().then((capsules) => renderDynamicGrid(capsules, cardGrid));
    }

    function deleteCapsule(id) {
        if (!confirm("Delete this capsule page? (Soft delete from config)")) return;
        const overridesKey = "capsules:overrides";
        const overrides = JSON.parse(localStorage.getItem(overridesKey) || "{}");
        overrides[id] = { active: false };
        localStorage.setItem(overridesKey, JSON.stringify(overrides));
        loadCapsules().then((capsules) => renderDynamicGrid(capsules, cardGrid));
        renderCapsuleManager();
    }

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

    if (createCapsulePanel) {
        const managerTitle = document.createElement("p");
        managerTitle.className = "panel-kicker";
        managerTitle.textContent = "Manage Capsules";

        const newCapsuleBtn = document.createElement("button");
        newCapsuleBtn.className = "action-btn";
        newCapsuleBtn.textContent = "Add New Capsule";
        newCapsuleBtn.type = "button";
        newCapsuleBtn.addEventListener("click", createNewCapsulePrompt);

        manageList = document.createElement("div");
        manageList.className = "manage-capsule-list";

        createCapsulePanel.append(newCapsuleBtn, managerTitle, manageList);
    }

    setCreateCapsuleEnabled(false);
    updateHomeAuthUI();

    signupBtn?.addEventListener("click", async () => {
        try {
            await signup();
        } catch (error) {
            setAuthStatus(error.message);
        }
    });

    loginBtn?.addEventListener("click", async () => {
        try {
            await login();
        } catch (error) {
            setAuthStatus(error.message);
        }
    });

    logoutBtn?.addEventListener("click", logout);

    resendVerifyBtn?.addEventListener("click", async () => {
        try {
            await requestEmailVerification();
        } catch (error) {
            setAuthStatus(error.message);
        }
    });

    verifyTokenBtn?.addEventListener("click", async () => {
        try {
            await verifyEmailWithToken();
        } catch (error) {
            setAuthStatus(error.message);
        }
    });

    requestResetBtn?.addEventListener("click", async () => {
        try {
            await requestPasswordReset();
        } catch (error) {
            setAuthStatus(error.message);
        }
    });

    resetPasswordBtn?.addEventListener("click", async () => {
        try {
            await resetPasswordWithToken();
        } catch (error) {
            setAuthStatus(error.message);
        }
    });

    restoreHomeSession().then(async () => {
        const params = new URLSearchParams(window.location.search);
        const tokenFromQuery = params.get("token");
        const modeFromQuery = params.get("mode");

        if (authTokenInput && tokenFromQuery) {
            authTokenInput.value = tokenFromQuery;
        }

        try {
            if (tokenFromQuery && modeFromQuery === "verify-email") {
                await verifyEmailWithToken();
            } else if (tokenFromQuery && modeFromQuery === "reset-password") {
                setAuthStatus("Paste your new password above, then tap Reset Password.");
            }
        } catch (error) {
            setAuthStatus(error.message);
        }
    });

    loadCapsules().then((capsules) => {
        renderDynamicGrid(capsules, cardGrid);
        renderCustomCapsules();
    });

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

    if (createCapsuleForm && capsuleNameInput && capsulePhotoInput) {
        createCapsuleForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!homeCurrentUser) {
                setAuthStatus("Sign in first, then create the capsule.");
                return;
            }

            const name = capsuleNameInput.value.trim();
            const photoFile = capsulePhotoInput.files && capsulePhotoInput.files[0];

            if (!name || !photoFile) {
                if (createCapsuleMsg) {
                    createCapsuleMsg.textContent = "Please enter a name and choose a photo.";
                }
                return;
            }

            const rawData = await readFileAsDataUrl(photoFile);
            const photoDataUrl = await downscaleImage(rawData, 900, 0.84);
            const slugBase = slugifyCapsuleName(name) || "capsule";

            const customCapsules = readCustomCapsules();
            const person = `${slugBase}-${Date.now().toString(36).slice(-5)}`;
            customCapsules.push({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name,
                person,
                photoDataUrl
            });
            writeCustomCapsules(customCapsules);

            createCapsuleForm.reset();
            renderCustomCapsules();
            if (createCapsuleMsg) {
                createCapsuleMsg.textContent = `Added a full capsule page for ${name}.`;
            }
        });
    }
}
