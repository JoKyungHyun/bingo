const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "submissions.json");
const BOARD_FILE = path.join(DATA_DIR, "board.json");

const DEFAULT_BINGO_ITEMS = [
  "아침 하늘", "동료와 셀카", "초록색 물건", "커피 한 잔", "웃긴 표정",
  "책 한 페이지", "운동 인증", "점심 메뉴", "손글씨", "창밖 풍경",
  "반려 식물", "팀 로고", "오늘의 신발", "간식 타임", "깨끗한 책상",
  "노을", "좋아하는 색", "물 마시기", "작은 성취", "퇴근길",
  "하트 모양", "추천 장소", "음악 듣기", "단체 사진", "자유 칸"
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

ensureStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/submissions") {
      return sendJson(res, 200, readSubmissions());
    }

    if (req.method === "GET" && url.pathname === "/api/board") {
      return sendJson(res, 200, { items: readBoard() });
    }

    if (req.method === "PUT" && url.pathname === "/api/board") {
      return handleBoardUpdate(req, res);
    }

    if (req.method === "POST" && url.pathname === "/api/submissions") {
      return handleUpload(req, res);
    }

    if (req.method === "DELETE" && url.pathname.startsWith("/api/submissions/")) {
      return handleDelete(res, url.pathname.split("/").pop());
    }

    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
      return serveFile(res, path.join(ROOT, decodeURIComponent(url.pathname)));
    }

    if (req.method === "GET") {
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      return serveFile(res, path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Bingo upload app running at http://localhost:${PORT}`);
});

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");
  if (!fs.existsSync(BOARD_FILE)) fs.writeFileSync(BOARD_FILE, JSON.stringify(DEFAULT_BINGO_ITEMS, null, 2));
}

function readSubmissions() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeSubmissions(items) {
  fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2));
}

function readBoard() {
  const items = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8"));
  if (!Array.isArray(items) || items.length !== 25) return DEFAULT_BINGO_ITEMS;
  return items.map((item, index) => cleanText(item || DEFAULT_BINGO_ITEMS[index]));
}

function writeBoard(items) {
  fs.writeFileSync(BOARD_FILE, JSON.stringify(items, null, 2));
}

function serveFile(res, filePath) {
  const resolved = path.resolve(filePath);
  const allowedRoots = [path.resolve(PUBLIC_DIR), path.resolve(UPLOAD_DIR)];
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep))) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(resolved, (error, content) => {
    if (error) return sendText(res, 404, "Not found");
    const type = MIME_TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

async function handleUpload(req, res) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) return sendJson(res, 400, { error: "Missing multipart boundary" });

  const buffer = await readRequest(req);
  const form = parseMultipart(buffer, boundary);
  const userId = cleanText(form.fields.userId || form.fields.participant || "anonymous");
  const participant = cleanText(form.fields.participant || form.fields.userLabel || userId || "익명");
  const memo = cleanText(form.fields.memo || "");
  const squareId = cleanText(form.fields.squareId || "");
  const squareTitle = cleanText(form.fields.squareTitle || "");
  const file = form.files.photo;

  if (!squareId || !squareTitle || !file || !file.data.length) {
    return sendJson(res, 400, { error: "빙고 칸과 사진을 모두 선택해 주세요." });
  }

  if (!file.type.startsWith("image/")) {
    return sendJson(res, 400, { error: "이미지 파일만 업로드할 수 있습니다." });
  }

  const ext = safeImageExtension(file.filename, file.type);
  const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const target = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(target, file.data);

  const item = {
    id: crypto.randomUUID(),
    userId,
    participant,
    memo,
    squareId,
    squareTitle,
    imageUrl: `/uploads/${filename}`,
    originalName: file.filename,
    createdAt: new Date().toISOString(),
  };

  const submissions = readSubmissions();
  const existing = submissions.find((entry) => entry.userId === userId && entry.squareId === squareId);
  if (existing) {
    existing.participant = participant;
    existing.memo = memo;
    existing.squareTitle = squareTitle;
    existing.imageUrl = `/uploads/${filename}`;
    existing.originalName = file.filename;
    existing.updatedAt = new Date().toISOString();
    writeSubmissions(submissions);
    return sendJson(res, 200, existing);
  }

  submissions.unshift(item);
  writeSubmissions(submissions);
  sendJson(res, 201, item);
}

async function handleBoardUpdate(req, res) {
  const payload = JSON.parse((await readRequest(req)).toString("utf8") || "{}");
  if (!Array.isArray(payload.items) || payload.items.length !== 25) {
    return sendJson(res, 400, { error: "빙고 칸은 25개여야 합니다." });
  }

  const items = payload.items.map((item, index) => {
    const text = cleanText(item);
    return text || DEFAULT_BINGO_ITEMS[index];
  });
  writeBoard(items);
  sendJson(res, 200, { items });
}

function handleDelete(res, id) {
  const submissions = readSubmissions();
  const item = submissions.find((entry) => entry.id === id);
  if (!item) return sendJson(res, 404, { error: "Not found" });

  const next = submissions.filter((entry) => entry.id !== id);
  writeSubmissions(next);
  const imagePath = path.join(ROOT, item.imageUrl);
  if (imagePath.startsWith(UPLOAD_DIR) && fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }
  sendJson(res, 200, { ok: true });
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let position = buffer.indexOf(delimiter);

  while (position !== -1) {
    const next = buffer.indexOf(delimiter, position + delimiter.length);
    if (next === -1) break;
    let part = buffer.subarray(position + delimiter.length, next);
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === "\r\n") part = part.subarray(0, part.length - 2);
    if (part.length && part.toString("utf8", 0, 2) !== "--") parts.push(part);
    position = next;
  }

  const fields = {};
  const files = {};

  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const body = part.subarray(headerEnd + 4);
    const name = headerText.match(/name="([^"]+)"/)?.[1];
    const filename = headerText.match(/filename="([^"]*)"/)?.[1];
    const type = headerText.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
    if (!name) continue;

    if (filename) {
      files[name] = { filename: path.basename(filename), type, data: body };
    } else {
      fields[name] = body.toString("utf8");
    }
  }

  return { fields, files };
}

function safeImageExtension(filename, type) {
  const ext = path.extname(filename || "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return ext;
  if (type === "image/png") return ".png";
  if (type === "image/gif") return ".gif";
  if (type === "image/webp") return ".webp";
  return ".jpg";
}

function cleanText(value) {
  return String(value).trim().slice(0, 160);
}

function readRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}
