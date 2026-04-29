let bingoItems = [
  "아침 하늘", "동료와 셀카", "초록색 물건", "커피 한 잔", "웃긴 표정",
  "책 한 페이지", "운동 인증", "점심 메뉴", "손글씨", "창밖 풍경",
  "반려 식물", "팀 로고", "오늘의 신발", "간식 타임", "깨끗한 책상",
  "노을", "좋아하는 색", "물 마시기", "작은 성취", "퇴근길",
  "하트 모양", "추천 장소", "음악 듣기", "단체 사진", "자유 칸"
];

const boardForm = document.querySelector("#boardForm");
const boardFields = document.querySelector("#boardFields");
const boardMessage = document.querySelector("#boardMessage");
const toggleEditor = document.querySelector("#toggleEditor");
const tabs = document.querySelector("#userTabs");
const list = document.querySelector("#adminList");
const modal = document.querySelector("#photoModal");
const modalImage = document.querySelector("#modalImage");
const modalSquare = document.querySelector("#modalSquare");
const modalUser = document.querySelector("#modalUser");
const modalTime = document.querySelector("#modalTime");
const deletePhoto = document.querySelector("#deletePhoto");
let submissions = [];
let users = [];
let activeUserId = null;
let activeSubmission = null;

init();

async function init() {
  toggleEditor.addEventListener("click", toggleBoardEditor);
  boardForm.addEventListener("submit", saveBoard);
  deletePhoto.addEventListener("click", deleteActiveSubmission);
  modal.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closePhotoModal);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closePhotoModal();
  });
  [bingoItems, submissions] = await Promise.all([fetchBoard(), fetchSubmissions()]);
  users = groupByUser(submissions);
  activeUserId = users[0]?.id || null;
  renderBoardEditor();
  render();
}

function renderBoardEditor() {
  boardFields.innerHTML = bingoItems.map((title, index) => `
    <label>
      ${index + 1}
      <input name="item-${index}" type="text" maxlength="80" value="${escapeHtml(title)}" required />
    </label>
  `).join("");
}

function toggleBoardEditor() {
  boardForm.hidden = !boardForm.hidden;
  toggleEditor.textContent = boardForm.hidden ? "수정 열기" : "수정 닫기";
  boardMessage.textContent = "";
}

async function saveBoard(event) {
  event.preventDefault();
  const items = Array.from(boardFields.querySelectorAll("input")).map((input) => input.value.trim());
  const button = boardForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "저장 중";

  try {
    const response = await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "저장에 실패했습니다.");

    bingoItems = result.items;
    renderBoardEditor();
    render();
    boardMessage.textContent = "저장됐습니다.";
  } catch (error) {
    boardMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "저장하기";
  }
}

function render() {
  if (!users.length) {
    tabs.innerHTML = "";
    list.innerHTML = `<p class="empty">아직 제출된 사진이 없습니다.</p>`;
    return;
  }

  renderTabs();
  renderActiveBoard();
}

function renderTabs() {
  tabs.innerHTML = users.map((user) => `
    <button class="user-tab ${user.id === activeUserId ? "is-active" : ""}" type="button" data-user-id="${escapeHtml(user.id)}">
      ${escapeHtml(user.label)}
    </button>
  `).join("");

  tabs.querySelectorAll("[data-user-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeUserId = button.dataset.userId;
      render();
    });
  });
}

function renderActiveBoard() {
  const user = users.find((entry) => entry.id === activeUserId) || users[0];
  if (!user) return;

  list.innerHTML = `
    <article class="user-board-card">
      <div class="user-board-head">
        <div>
          <h2>${escapeHtml(user.label)}님의 빙고판</h2>
          <p>${countSubmittedSquares(user.items)} / ${bingoItems.length} 제출</p>
        </div>
      </div>
      <div class="admin-bingo-board">
        ${renderUserBoard(user)}
      </div>
    </article>
  `;

  list.querySelectorAll("[data-submission-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = submissions.find((submission) => submission.id === button.dataset.submissionId);
      if (item) openPhotoModal(item);
    });
  });
}

function renderUserBoard(user) {
  const latestBySquare = new Map();
  user.items.forEach((item) => {
    if (!latestBySquare.has(item.squareId)) latestBySquare.set(item.squareId, item);
  });

  return bingoItems.map((title, index) => {
    const squareId = `square-${index}`;
    const item = latestBySquare.get(squareId);
    if (!item) {
      return `<button class="admin-bingo-cell empty-cell" type="button" disabled><span>${escapeHtml(title)}</span></button>`;
    }

    return `
      <button class="admin-bingo-cell uploaded" type="button" data-submission-id="${item.id}">
        <span>${escapeHtml(title)}</span>
      </button>
    `;
  }).join("");
}

function openPhotoModal(item) {
  activeSubmission = item;
  modalImage.src = item.imageUrl;
  modalImage.alt = `${getCurrentSquareTitle(item)} 인증 사진`;
  modalSquare.textContent = getCurrentSquareTitle(item);
  modalUser.textContent = item.participant || "익명";
  modalTime.textContent = formatDate(item.createdAt);
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closePhotoModal() {
  modal.hidden = true;
  modalImage.removeAttribute("src");
  activeSubmission = null;
  document.body.classList.remove("modal-open");
}

async function deleteActiveSubmission() {
  if (!activeSubmission) return;
  const ok = window.confirm(`${getCurrentSquareTitle(activeSubmission)} 사진을 삭제할까요?`);
  if (!ok) return;

  const response = await fetch(`/api/submissions/${activeSubmission.id}`, { method: "DELETE" });
  if (!response.ok) {
    window.alert("삭제에 실패했습니다.");
    return;
  }

  closePhotoModal();
  submissions = await fetchSubmissions();
  users = groupByUser(submissions);
  if (!users.some((user) => user.id === activeUserId)) {
    activeUserId = users[0]?.id || null;
  }
  render();
}

function groupByUser(items) {
  const groups = new Map();
  items.forEach((item) => {
    const userId = getSubmissionUserId(item);
    if (!groups.has(userId)) {
      groups.set(userId, {
        id: userId,
        label: item.participant || userId || "익명",
        items: [],
      });
    }
    groups.get(userId).items.push(item);
  });

  return Array.from(groups.values()).map((user) => ({
    ...user,
    items: user.items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  }));
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

function getSubmissionUserId(item) {
  return item.userId || item.participant || "anonymous";
}

function countSubmittedSquares(items) {
  return new Set(items.map((item) => item.squareId)).size;
}

function getCurrentSquareTitle(item) {
  const index = Number(String(item.squareId).replace("square-", ""));
  return bingoItems[index] || item.squareTitle;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}
