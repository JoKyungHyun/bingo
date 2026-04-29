let bingoItems = [
  "아침 하늘", "동료와 셀카", "초록색 물건", "커피 한 잔", "웃긴 표정",
  "책 한 페이지", "운동 인증", "점심 메뉴", "손글씨", "창밖 풍경",
  "반려 식물", "팀 로고", "오늘의 신발", "간식 타임", "깨끗한 책상",
  "노을", "좋아하는 색", "물 마시기", "작은 성취", "퇴근길",
  "하트 모양", "추천 장소", "음악 듣기", "단체 사진", "자유 칸"
];

const board = document.querySelector("#bingoBoard");
const form = document.querySelector("#uploadForm");
const uploadModal = document.querySelector("#uploadModal");
const nameModal = document.querySelector("#nameModal");
const nameForm = document.querySelector("#nameForm");
const nameInput = document.querySelector("#nameInput");
const playerName = document.querySelector("#playerName");
const squareId = document.querySelector("#squareId");
const userIdField = document.querySelector("#userId");
const userLabelField = document.querySelector("#userLabel");
const selectedSquare = document.querySelector("#selectedSquare");
const currentPhoto = document.querySelector("#currentPhoto");
const currentPhotoImage = document.querySelector("#currentPhotoImage");
const message = document.querySelector("#message");
const progress = document.querySelector("#progress");
let currentUser = getStoredUser();
let submissions = [];

init();

async function init() {
  if (!currentUser?.named) openNameModal();
  applyUser();
  [bingoItems, submissions] = await Promise.all([fetchBoard(), fetchSubmissions()]);
  renderBoard();

  nameForm.addEventListener("submit", saveName);
  form.addEventListener("submit", submitPhoto);
  uploadModal.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeUploadModal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !uploadModal.hidden) closeUploadModal();
  });
}

function renderBoard() {
  const mySubmissions = currentUser?.named
    ? submissions.filter((item) => getSubmissionUserId(item) === currentUser.id)
    : [];
  const submitted = new Set(mySubmissions.map((item) => item.squareId));
  board.innerHTML = "";

  bingoItems.forEach((title, index) => {
    const id = `square-${index}`;
    const button = document.createElement("button");
    button.className = "bingo-cell";
    button.type = "button";
    button.dataset.id = id;
    button.dataset.title = title;
    button.innerHTML = `<span>${title}</span>`;
    if (submitted.has(id)) button.classList.add("uploaded");
    button.addEventListener("click", () => openUploadModal(button));
    board.appendChild(button);
  });

  progress.textContent = `${submitted.size} / ${bingoItems.length} 제출`;
}

function openNameModal() {
  nameModal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => nameInput.focus(), 0);
}

function saveName(event) {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  const id = currentUser?.id || crypto.randomUUID();
  currentUser = { id, label: name, named: true };
  localStorage.setItem("bingoUser", JSON.stringify(currentUser));
  nameModal.hidden = true;
  document.body.classList.remove("modal-open");
  applyUser();
  renderBoard();
}

function applyUser() {
  const label = currentUser?.label || "";
  playerName.textContent = currentUser?.named ? `${label}님의 빙고판` : "이름을 입력하면 개인 빙고판이 만들어집니다.";
  userIdField.value = currentUser?.id || "";
  userLabelField.value = currentUser?.named ? label : "";
}

function openUploadModal(button) {
  if (!currentUser?.named) {
    openNameModal();
    return;
  }

  document.querySelectorAll(".bingo-cell").forEach((cell) => cell.classList.remove("selected"));
  button.classList.add("selected");
  squareId.value = button.dataset.id;
  selectedSquare.value = button.dataset.title;
  const existing = getMySubmission(button.dataset.id);
  if (existing) {
    currentPhoto.hidden = false;
    currentPhotoImage.src = existing.imageUrl;
    currentPhotoImage.alt = `${button.dataset.title} 현재 사진`;
    uploadModal.querySelector("#modalTitle").textContent = "사진 변경";
    form.querySelector('button[type="submit"]').textContent = "변경하기";
  } else {
    currentPhoto.hidden = true;
    currentPhotoImage.removeAttribute("src");
    uploadModal.querySelector("#modalTitle").textContent = "사진 업로드";
    form.querySelector('button[type="submit"]').textContent = "제출하기";
  }
  message.textContent = "";
  uploadModal.hidden = false;
  document.body.classList.add("modal-open");
  form.querySelector('input[name="photo"]').focus();
}

function closeUploadModal() {
  uploadModal.hidden = true;
  document.body.classList.remove("modal-open");
  form.reset();
  currentPhoto.hidden = true;
  currentPhotoImage.removeAttribute("src");
  uploadModal.querySelector("#modalTitle").textContent = "사진 업로드";
  squareId.value = "";
  selectedSquare.value = "";
  message.textContent = "";
  document.querySelectorAll(".bingo-cell").forEach((cell) => cell.classList.remove("selected"));
}

async function submitPhoto(event) {
  event.preventDefault();
  if (!currentUser?.named) {
    openNameModal();
    return;
  }
  if (!squareId.value) {
    message.textContent = "먼저 빙고 칸을 선택해 주세요.";
    return;
  }

  const data = new FormData(form);
  data.set("squareId", squareId.value);
  data.set("squareTitle", selectedSquare.value);
  data.set("userId", currentUser.id);
  data.set("userLabel", currentUser.label);

  const button = form.querySelector("button");
  button.disabled = true;
  button.textContent = "업로드 중";

  try {
    const response = await fetch("/api/submissions", { method: "POST", body: data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "업로드에 실패했습니다.");

    message.textContent = result.updatedAt ? "사진이 변경됐습니다." : "제출됐습니다.";
    submissions = await fetchSubmissions();
    renderBoard();
    setTimeout(closeUploadModal, 700);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "제출하기";
  }
}

async function fetchSubmissions() {
  const response = await fetch("/api/submissions");
  return response.json();
}

async function fetchBoard() {
  const response = await fetch("/api/board");
  const result = await response.json();
  return result.items;
}

function getStoredUser() {
  const saved = localStorage.getItem("bingoUser");
  if (!saved) return null;

  try {
    const user = JSON.parse(saved);
    if (user?.id && user?.label) return user;
  } catch {
    localStorage.removeItem("bingoUser");
  }
  return null;
}

function getSubmissionUserId(item) {
  return item.userId || item.participant || "anonymous";
}

function getMySubmission(targetSquareId) {
  if (!currentUser?.named) return null;
  return submissions.find((item) => getSubmissionUserId(item) === currentUser.id && item.squareId === targetSquareId);
}
