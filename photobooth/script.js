const TEMPLATE_OPTIONS = [
  { id: "strip", name: "Classic Strip", desc: "4 vertical moments" },
  { id: "grid", name: "Memory Grid", desc: "2x2 balanced layout" }
];

const API_BASE = "/api";
const AUTH_TOKEN_KEY = "photobooth:authToken";

const booth = document.getElementById("booth");
const captionInput = document.getElementById("captionInput");
const caption = document.getElementById("caption");
const exportBtn = document.getElementById("exportBtn");
const clearFramesBtn = document.getElementById("clearFramesBtn");
const saveProjectBtn = document.getElementById("saveProjectBtn");
const loadProjectBtn = document.getElementById("loadProjectBtn");
const shareBtn = document.getElementById("shareBtn");
const projectInput = document.getElementById("projectInput");
const statusMsg = document.getElementById("statusMsg");
const templatePicker = document.getElementById("templatePicker");
const photoInput = document.getElementById("photoInput");
const photoBank = document.getElementById("photoBank");
const photoCount = document.getElementById("photoCount");
const dropzone = document.querySelector(".dropzone");
const personLabel = document.getElementById("personLabel");

const authNameInput = document.getElementById("authName");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authTokenInput = document.getElementById("authTokenInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const resendVerifyBtn = document.getElementById("resendVerifyBtn");
const requestResetBtn = document.getElementById("requestResetBtn");
const verifyTokenBtn = document.getElementById("verifyTokenBtn");
const resetPasswordBtn = document.getElementById("resetPasswordBtn");
const authStatus = document.getElementById("authStatus");

const saveCloudBtn = document.getElementById("saveCloudBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const projectSelect = document.getElementById("projectSelect");
const loadCloudBtn = document.getElementById("loadCloudBtn");

const frameEls = Array.from(document.querySelectorAll(".frame"));
const params = new URLSearchParams(window.location.search);
const uploadedPhotos = [];

const STORAGE_VERSION = 1;
const person = params.get("person");
const draftStorageKey = `photobooth:draft:${person || "guest"}`;

let readyForAutosave = false;
let activeTemplate = TEMPLATE_OPTIONS[0].id;
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
let currentUser = null;
let currentCloudProjectId = null;

function setTemplate(templateName) {
  booth.classList.remove(...TEMPLATE_OPTIONS.map((template) => template.id));
  booth.classList.add(templateName);
  activeTemplate = templateName;

  const buttons = Array.from(templatePicker.querySelectorAll(".template-btn"));
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.template === templateName);
  });

  saveDraft();
}

function setCaption(value) {
  caption.textContent = value.trim() || "Photobooth";
}

function setStatus(message) {
  statusMsg.textContent = message || "";
}

function setAuthStatus(message) {
  authStatus.textContent = message || "";
}

function updateAuthUI() {
  if (currentUser) {
    const verifyState = currentUser.emailVerified ? "verified" : "not verified";
    setAuthStatus(`Signed in as ${currentUser.email} (${verifyState})`);
  } else {
    setAuthStatus("Not signed in");
  }

  const isSignedIn = Boolean(currentUser);
  const isVerified = Boolean(currentUser && currentUser.emailVerified);
  saveCloudBtn.disabled = !isSignedIn || !isVerified;
  copyLinkBtn.disabled = !isSignedIn || !isVerified;
  loadCloudBtn.disabled = !isSignedIn;
  logoutBtn.disabled = !isSignedIn;
  signupBtn.disabled = isSignedIn;
  loginBtn.disabled = isSignedIn;
  resendVerifyBtn.disabled = !isSignedIn;
}

function setFrameImage(frameIndex, dataUrl, photoIndex = null) {
  const frame = frameEls[frameIndex];
  if (!frame) return;
  frame.style.backgroundImage = `url("${dataUrl}")`;
  if (typeof photoIndex === "number" && photoIndex >= 0) {
    frame.dataset.photoIndex = String(photoIndex);
  } else {
    delete frame.dataset.photoIndex;
  }
}

function clearFrames(persist = true) {
  frameEls.forEach((frame) => {
    frame.style.backgroundImage = "";
    delete frame.dataset.photoIndex;
  });
  if (persist) saveDraft();
}

function assignPhotoToFrame(photoIndex, frameIndex) {
  const photoUrl = uploadedPhotos[photoIndex];
  if (!photoUrl) return;
  setFrameImage(frameIndex, photoUrl, photoIndex);
  saveDraft();
}

function updatePhotoCount() {
  photoCount.textContent = `${uploadedPhotos.length} photo(s) loaded`;
}

function renderTemplatePicker() {
  templatePicker.innerHTML = "";
  TEMPLATE_OPTIONS.forEach((template) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "template-btn";
    button.dataset.template = template.id;
    button.innerHTML = `<span class="name">${template.name}</span><span class="desc">${template.desc}</span>`;
    button.addEventListener("click", () => setTemplate(template.id));
    templatePicker.appendChild(button);
  });
  setTemplate(activeTemplate);
}

function renderPhotoBank() {
  photoBank.innerHTML = "";
  uploadedPhotos.forEach((photoUrl, index) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "photo-thumb";
    thumb.draggable = true;
    thumb.title = `Photo ${index + 1}`;
    thumb.style.backgroundImage = `url("${photoUrl}")`;

    thumb.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/photo-index", String(index));
      event.dataTransfer.effectAllowed = "copy";
    });

    thumb.addEventListener("click", () => {
      const firstEmptyFrame = frameEls.findIndex((frame) => !frame.style.backgroundImage);
      const targetFrame = firstEmptyFrame === -1 ? 0 : firstEmptyFrame;
      assignPhotoToFrame(index, targetFrame);
    });

    photoBank.appendChild(thumb);
  });
  updatePhotoCount();
}

function addPhoto(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
  uploadedPhotos.push(dataUrl);
}

function addPhotosFromFiles(files) {
  files.forEach((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      addPhoto(reader.result);
      renderPhotoBank();

      const photoIndex = uploadedPhotos.length - 1;
      const firstEmptyFrame = frameEls.findIndex((frame) => !frame.style.backgroundImage);
      if (firstEmptyFrame !== -1) {
        assignPhotoToFrame(photoIndex, firstEmptyFrame);
      }
      saveDraft();
    };
    reader.readAsDataURL(file);
  });
}

function buildProjectState() {
  const frameAssignments = frameEls.map((frame) => {
    const idx = Number(frame.dataset.photoIndex);
    return Number.isNaN(idx) ? null : idx;
  });

  return {
    version: STORAGE_VERSION,
    template: activeTemplate,
    caption: captionInput.value.trim() || "Photobooth",
    uploadedPhotos: [...uploadedPhotos],
    frameAssignments
  };
}

function saveDraft() {
  if (!readyForAutosave) return;
  try {
    localStorage.setItem(draftStorageKey, JSON.stringify(buildProjectState()));
  } catch (_error) {
    setStatus("Could not save draft. Storage might be full.");
  }
}

function applyProjectState(state, options = {}) {
  const { persist = true } = options;
  if (!state || typeof state !== "object") return false;
  if (!Array.isArray(state.uploadedPhotos) || !Array.isArray(state.frameAssignments)) {
    return false;
  }

  uploadedPhotos.length = 0;
  state.uploadedPhotos.forEach((photoUrl) => addPhoto(photoUrl));
  renderPhotoBank();

  if (
    typeof state.template === "string" &&
    TEMPLATE_OPTIONS.some((template) => template.id === state.template)
  ) {
    setTemplate(state.template);
  }

  const nextCaption = typeof state.caption === "string" ? state.caption : "Photobooth";
  captionInput.value = nextCaption;
  setCaption(nextCaption);

  clearFrames(false);
  state.frameAssignments.slice(0, frameEls.length).forEach((photoIndex, frameIndex) => {
    if (typeof photoIndex !== "number" || photoIndex < 0) return;
    if (!uploadedPhotos[photoIndex]) return;
    setFrameImage(frameIndex, uploadedPhotos[photoIndex], photoIndex);
  });

  if (persist) saveDraft();
  return true;
}

function loadLegacyPhotos(personKey) {
  if (!personKey) return false;
  const storageKey = `photobooth:${personKey}`;
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (!Array.isArray(saved) || !saved.length) return false;

  saved.forEach((photoUrl) => addPhoto(photoUrl));
  renderPhotoBank();

  frameEls.forEach((_frame, index) => {
    if (!uploadedPhotos[index]) return;
    assignPhotoToFrame(index, index);
  });

  saveDraft();
  return true;
}

function loadDraft() {
  const savedDraft = localStorage.getItem(draftStorageKey);
  if (savedDraft) {
    try {
      const parsed = JSON.parse(savedDraft);
      if (applyProjectState(parsed, { persist: false })) return;
    } catch (_error) {
      // ignore malformed state
    }
  }
  loadLegacyPhotos(person);
}

function slugifyName(name) {
  return (name || "photobooth")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function getExportCanvas() {
  return html2canvas(booth, {
    backgroundColor: null,
    scale: 3
  });
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

async function exportPng() {
  const canvas = await getExportCanvas();
  downloadDataUrl(`${slugifyName(captionInput.value)}.png`, canvas.toDataURL("image/png"));
  setStatus("PNG exported.");
}

async function sharePng() {
  const canvas = await getExportCanvas();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    setStatus("Could not create share file.");
    return;
  }

  const fileName = `${slugifyName(captionInput.value)}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      title: captionInput.value || "Photobooth",
      text: "Sharing my photobooth creation",
      files: [file]
    });
    setStatus("Shared successfully.");
    return;
  }

  downloadDataUrl(fileName, canvas.toDataURL("image/png"));
  setStatus("Share is not available on this device. Downloaded PNG instead.");
}

function saveProjectToFile() {
  const project = buildProjectState();
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const fileName = `${slugifyName(captionInput.value)}.photobooth.json`;
  downloadDataUrl(fileName, url);
  setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("Project saved as a file.");
}

function loadProjectFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (!applyProjectState(parsed)) {
        setStatus("Invalid project file.");
        return;
      }
      setStatus("Project loaded.");
    } catch (_error) {
      setStatus("Could not read project file.");
    }
  };
  reader.readAsText(file);
}

async function apiRequest(path, options = {}) {
  const headers = { ...options.headers };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, {
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

  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setProjectInUrl(projectId) {
  const nextUrl = new URL(window.location.href);
  if (projectId) nextUrl.searchParams.set("project", projectId);
  else nextUrl.searchParams.delete("project");
  window.history.replaceState({}, "", nextUrl.toString());
}

function getShareLink(projectId) {
  const link = new URL(window.location.href);
  link.searchParams.set("project", projectId);
  return link.toString();
}

function extractToken(value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get("token") || raw;
  } catch (_error) {
    return raw;
  }
}

async function signup() {
  const name = authNameInput.value.trim();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    setAuthStatus("Email and password are required.");
    return;
  }

  const data = await apiRequest("/auth/signup", {
    method: "POST",
    body: { name, email, password }
  });

  authToken = data.token;
  localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  currentUser = data.user;
  updateAuthUI();
  await loadMyProjects();

  if (data.verificationPlaceholderUrl) {
    authTokenInput.value = data.verificationPlaceholderUrl;
  }

  setStatus("Account created. Verify your email to enable cloud saving.");
}

async function login() {
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) {
    setAuthStatus("Email and password are required.");
    return;
  }

  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: { email, password }
  });

  authToken = data.token;
  localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  currentUser = data.user;
  updateAuthUI();
  await loadMyProjects();
  setStatus(currentUser.emailVerified ? "Signed in." : "Signed in. Please verify email.");
}

function logout() {
  authToken = "";
  currentUser = null;
  currentCloudProjectId = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  updateAuthUI();
  projectSelect.innerHTML = "<option value=\"\">Choose a saved booth</option>";
  setStatus("Signed out.");
}

async function restoreSession() {
  if (!authToken) {
    updateAuthUI();
    return;
  }

  try {
    const data = await apiRequest("/auth/me");
    currentUser = data.user;
    updateAuthUI();
    await loadMyProjects();
  } catch (_error) {
    logout();
  }
}

async function requestEmailVerification() {
  const email = authEmailInput.value.trim();
  const data = await apiRequest("/auth/request-email-verification", {
    method: "POST",
    body: { email }
  });

  if (data.verificationPlaceholderUrl) {
    authTokenInput.value = data.verificationPlaceholderUrl;
    setStatus("Verification link generated (placeholder). Use token input to verify.");
  } else {
    setStatus("If the account exists, a verification email has been sent.");
  }
}

async function verifyEmailWithToken() {
  const token = extractToken(authTokenInput.value);
  if (!token) {
    setStatus("Paste a verification token first.");
    return;
  }

  await apiRequest("/auth/verify-email", {
    method: "POST",
    body: { token }
  });

  setStatus("Email verified.");
  if (currentUser) {
    const data = await apiRequest("/auth/me");
    currentUser = data.user;
    updateAuthUI();
  }
}

async function requestPasswordReset() {
  const email = authEmailInput.value.trim();
  if (!email) {
    setStatus("Enter your email first.");
    return;
  }

  const data = await apiRequest("/auth/request-password-reset", {
    method: "POST",
    body: { email }
  });

  if (data.resetPlaceholderUrl) {
    authTokenInput.value = data.resetPlaceholderUrl;
    setStatus("Reset link generated (placeholder). Paste token and set new password.");
  } else {
    setStatus("If the account exists, a reset email has been sent.");
  }
}

async function resetPasswordWithToken() {
  const token = extractToken(authTokenInput.value);
  const newPassword = newPasswordInput.value;
  if (!token || !newPassword) {
    setStatus("Token and new password are required.");
    return;
  }

  await apiRequest("/auth/reset-password", {
    method: "POST",
    body: { token, newPassword }
  });

  newPasswordInput.value = "";
  setStatus("Password reset successfully. You can sign in now.");
}

async function loadMyProjects() {
  if (!currentUser) return;
  const data = await apiRequest("/projects/mine");
  const projects = Array.isArray(data.projects) ? data.projects : [];

  projectSelect.innerHTML = "<option value=\"\">Choose a saved booth</option>";
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.title || "Untitled"} (${new Date(project.updatedAt).toLocaleString()})`;
    projectSelect.appendChild(option);
  });

  if (currentCloudProjectId) projectSelect.value = currentCloudProjectId;
}

async function saveToCloud() {
  if (!currentUser) {
    setStatus("Sign in first.");
    return;
  }
  if (!currentUser.emailVerified) {
    setStatus("Verify your email before saving online.");
    return;
  }

  const payload = {
    title: captionInput.value.trim() || "Photobooth",
    state: buildProjectState(),
    isPublic: true
  };

  let data;
  if (currentCloudProjectId) {
    data = await apiRequest(`/projects/${currentCloudProjectId}`, {
      method: "PUT",
      body: payload
    });
  } else {
    data = await apiRequest("/projects", {
      method: "POST",
      body: payload
    });
  }

  currentCloudProjectId = data.project.id;
  setProjectInUrl(currentCloudProjectId);
  await loadMyProjects();
  setStatus("Saved online. Persistent link is ready.");
}

async function copyPersistentLink() {
  if (!currentUser || !currentUser.emailVerified) {
    setStatus("Sign in with a verified email first.");
    return;
  }
  if (!currentCloudProjectId) await saveToCloud();
  if (!currentCloudProjectId) return;

  const link = getShareLink(currentCloudProjectId);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(link);
    setStatus("Share link copied.");
    return;
  }

  window.prompt("Copy this link", link);
  setStatus("Share link generated.");
}

async function loadCloudProjectById(projectId) {
  const data = await apiRequest(`/projects/${projectId}`);
  if (!applyProjectState(data.project.state)) {
    throw new Error("Project data is invalid.");
  }

  currentCloudProjectId = data.project.id;
  setProjectInUrl(currentCloudProjectId);
  if (currentUser) await loadMyProjects();
  setStatus("Cloud project loaded.");
}

captionInput.addEventListener("input", () => {
  setCaption(captionInput.value);
  saveDraft();
});

photoInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  addPhotosFromFiles(files);
  event.target.value = "";
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("drag-over");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag-over");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag-over");
  const files = Array.from(event.dataTransfer.files || []);
  if (!files.length) return;
  addPhotosFromFiles(files);
});

frameEls.forEach((frame, frameIndex) => {
  frame.addEventListener("dragover", (event) => {
    event.preventDefault();
    frame.classList.add("drag-over");
    event.dataTransfer.dropEffect = "copy";
  });

  frame.addEventListener("dragleave", () => {
    frame.classList.remove("drag-over");
  });

  frame.addEventListener("drop", (event) => {
    event.preventDefault();
    frame.classList.remove("drag-over");
    const photoIndex = Number(event.dataTransfer.getData("text/photo-index"));
    if (Number.isNaN(photoIndex)) return;
    assignPhotoToFrame(photoIndex, frameIndex);
  });
});

clearFramesBtn.addEventListener("click", () => clearFrames());

exportBtn.addEventListener("click", async () => {
  try {
    await exportPng();
  } catch (_error) {
    setStatus("Could not export PNG.");
  }
});

saveProjectBtn.addEventListener("click", () => saveProjectToFile());
loadProjectBtn.addEventListener("click", () => projectInput.click());

projectInput.addEventListener("change", (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) loadProjectFromFile(file);
  event.target.value = "";
});

shareBtn.addEventListener("click", async () => {
  try {
    await sharePng();
  } catch (_error) {
    setStatus("Sharing was canceled or failed.");
  }
});

signupBtn.addEventListener("click", async () => {
  try {
    await signup();
  } catch (error) {
    setAuthStatus(error.message);
  }
});

loginBtn.addEventListener("click", async () => {
  try {
    await login();
  } catch (error) {
    setAuthStatus(error.message);
  }
});

logoutBtn.addEventListener("click", () => logout());

resendVerifyBtn.addEventListener("click", async () => {
  try {
    await requestEmailVerification();
  } catch (error) {
    setStatus(error.message);
  }
});

verifyTokenBtn.addEventListener("click", async () => {
  try {
    await verifyEmailWithToken();
  } catch (error) {
    setStatus(error.message);
  }
});

requestResetBtn.addEventListener("click", async () => {
  try {
    await requestPasswordReset();
  } catch (error) {
    setStatus(error.message);
  }
});

resetPasswordBtn.addEventListener("click", async () => {
  try {
    await resetPasswordWithToken();
  } catch (error) {
    setStatus(error.message);
  }
});

saveCloudBtn.addEventListener("click", async () => {
  try {
    await saveToCloud();
  } catch (error) {
    setStatus(error.message);
  }
});

copyLinkBtn.addEventListener("click", async () => {
  try {
    await copyPersistentLink();
  } catch (error) {
    setStatus(error.message);
  }
});

loadCloudBtn.addEventListener("click", async () => {
  const projectId = projectSelect.value;
  if (!projectId) {
    setStatus("Select a saved booth first.");
    return;
  }

  try {
    await loadCloudProjectById(projectId);
  } catch (error) {
    setStatus(error.message);
  }
});

const defaultCaption =
  params.get("caption") || (person ? `${person.charAt(0).toUpperCase()}${person.slice(1)}'s Booth` : "Photobooth");

personLabel.textContent = person
  ? `Editing: ${person.charAt(0).toUpperCase()}${person.slice(1)}`
  : "Editing: Guest";
captionInput.value = defaultCaption;
setCaption(defaultCaption);
renderTemplatePicker();
renderPhotoBank();
loadDraft();
readyForAutosave = true;
updateAuthUI();

(async function initCloud() {
  await restoreSession();

  const projectId = params.get("project");
  if (projectId) {
    try {
      await loadCloudProjectById(projectId);
    } catch (error) {
      setStatus(`Could not load shared project: ${error.message}`);
    }
  }

  const tokenFromQuery = params.get("token");
  const modeFromQuery = params.get("mode");
  if (tokenFromQuery && modeFromQuery === "verify-email") {
    authTokenInput.value = tokenFromQuery;
    try {
      await verifyEmailWithToken();
      params.delete("token");
      params.delete("mode");
      const nextUrl = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, "");
      window.history.replaceState({}, "", nextUrl || window.location.pathname);
    } catch (_error) {
      // keep token in input for manual retry
    }
  }
})();
