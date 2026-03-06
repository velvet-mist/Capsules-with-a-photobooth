const TEMPLATE_OPTIONS = [
  { id: "strip", name: "Classic Strip", desc: "4 vertical moments" },
  { id: "grid", name: "Memory Grid", desc: "2x2 balanced layout" }
];

const booth = document.getElementById("booth");
const captionInput = document.getElementById("captionInput");
const caption = document.getElementById("caption");
const exportBtn = document.getElementById("exportBtn");
const clearFramesBtn = document.getElementById("clearFramesBtn");
const templatePicker = document.getElementById("templatePicker");
const photoInput = document.getElementById("photoInput");
const photoBank = document.getElementById("photoBank");
const photoCount = document.getElementById("photoCount");
const dropzone = document.querySelector(".dropzone");
const personLabel = document.getElementById("personLabel");

const frameEls = Array.from(document.querySelectorAll(".frame"));
const params = new URLSearchParams(window.location.search);
const uploadedPhotos = [];
let activeTemplate = TEMPLATE_OPTIONS[0].id;

function setTemplate(templateName) {
  booth.classList.remove(...TEMPLATE_OPTIONS.map((template) => template.id));
  booth.classList.add(templateName);
  activeTemplate = templateName;

  const buttons = Array.from(templatePicker.querySelectorAll(".template-btn"));
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.template === templateName);
  });
}

function setCaption(value) {
  caption.textContent = value.trim() || "Photobooth";
}

function setFrameImage(frameIndex, dataUrl) {
  const frame = frameEls[frameIndex];
  if (!frame) return;
  frame.style.backgroundImage = `url("${dataUrl}")`;
}

function clearFrames() {
  frameEls.forEach((frame) => {
    frame.style.backgroundImage = "";
  });
}

function assignPhotoToFrame(photoIndex, frameIndex) {
  const photoUrl = uploadedPhotos[photoIndex];
  if (!photoUrl) return;
  setFrameImage(frameIndex, photoUrl);
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
      const firstEmptyFrame = frameEls.findIndex(
        (frame) => !frame.style.backgroundImage
      );
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
      const firstEmptyFrame = frameEls.findIndex(
        (frame) => !frame.style.backgroundImage
      );
      if (firstEmptyFrame !== -1) {
        assignPhotoToFrame(photoIndex, firstEmptyFrame);
      }
    };
    reader.readAsDataURL(file);
  });
}

function loadSavedPhotos(personKey) {
  if (!personKey) return;
  const storageKey = `photobooth:${personKey}`;
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  if (!Array.isArray(saved) || !saved.length) return;

  saved.forEach((photoUrl) => addPhoto(photoUrl));
  renderPhotoBank();

  frameEls.forEach((frame, index) => {
    if (!uploadedPhotos[index]) return;
    frame.style.backgroundImage = "";
    assignPhotoToFrame(index, index);
  });
}

captionInput.addEventListener("input", () => {
  setCaption(captionInput.value);
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

clearFramesBtn.addEventListener("click", () => {
  clearFrames();
});

exportBtn.addEventListener("click", async () => {
  const canvas = await html2canvas(booth, {
    backgroundColor: null,
    scale: 3
  });

  const link = document.createElement("a");
  link.download = "photobooth.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

const person = params.get("person");
const defaultCaption =
  params.get("caption") || (person ? `${person}'s Booth` : "Photobooth");

personLabel.textContent = person
  ? `Editing: ${person.charAt(0).toUpperCase()}${person.slice(1)}`
  : "Editing: Guest";
captionInput.value = defaultCaption;
setCaption(defaultCaption);
renderTemplatePicker();
renderPhotoBank();
loadSavedPhotos(person);
