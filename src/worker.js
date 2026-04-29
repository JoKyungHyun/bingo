const DEFAULT_BINGO_ITEMS = [
  "아침", "동료와 셀카", "초록색 물건", "커피 한 잔", "웃긴 표정",
  "책 한 페이지", "운동 인증", "점심 메뉴", "손글씨", "창밖 풍경",
  "반려 식물", "팀 로고", "오늘의 신발", "간식 타임", "깨끗한 책상",
  "노을", "좋아하는 색", "물 마시기", "작은 성취", "퇴근길",
  "하트 모양", "추천 장소", "음악 듣기", "단체 사진", "자유 칸"
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/api/board") {
        return json({ items: await readBoard(env) });
      }

      if (request.method === "PUT" && url.pathname === "/api/board") {
        return updateBoard(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/submissions") {
        return json(await readSubmissions(env));
      }

      if (request.method === "POST" && url.pathname === "/api/submissions") {
        return uploadSubmission(request, env, ctx);
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/submissions/")) {
        return deleteSubmission(url.pathname.split("/").pop(), env);
      }

      if (request.method === "GET" && url.pathname.startsWith("/uploads/")) {
        return servePhoto(url.pathname.replace("/uploads/", ""), env);
      }

      if (request.method === "GET" || request.method === "HEAD") {
        return env.ASSETS.fetch(request);
      }

      return json({ error: "Method not allowed" }, 405);
    } catch (error) {
      console.error(error);
      return json({ error: "Server error" }, 500);
    }
  },
};

async function readBoard(env) {
  const rows = await env.DB.prepare("SELECT idx, title FROM board_items ORDER BY idx").all();
  if (!rows.results?.length) {
    return DEFAULT_BINGO_ITEMS;
  }

  const items = [...DEFAULT_BINGO_ITEMS];
  rows.results.forEach((row) => {
    if (Number.isInteger(row.idx) && row.idx >= 0 && row.idx < 25) {
      items[row.idx] = cleanText(row.title) || DEFAULT_BINGO_ITEMS[row.idx];
    }
  });
  return items;
}

async function updateBoard(request, env) {
  const payload = await request.json();
  if (!Array.isArray(payload.items) || payload.items.length !== 25) {
    return json({ error: "빙고 칸은 25개여야 합니다." }, 400);
  }

  const items = payload.items.map((item, index) => cleanText(item) || DEFAULT_BINGO_ITEMS[index]);
  const statements = items.map((title, index) => (
    env.DB.prepare(
      "INSERT INTO board_items (idx, title) VALUES (?, ?) ON CONFLICT(idx) DO UPDATE SET title = excluded.title"
    ).bind(index, title)
  ));
  await env.DB.batch(statements);
  return json({ items });
}

async function readSubmissions(env) {
  const rows = await env.DB.prepare(
    `SELECT id, user_id, participant, memo, square_id, square_title, image_key, original_name, created_at, updated_at
     FROM submissions
     ORDER BY datetime(COALESCE(updated_at, created_at)) DESC`
  ).all();

  return (rows.results || []).map(formatSubmission);
}

async function uploadSubmission(request, env, ctx) {
  const form = await request.formData();
  const userId = cleanText(form.get("userId") || form.get("participant") || "anonymous");
  const participant = cleanText(form.get("participant") || form.get("userLabel") || userId || "익명");
  const memo = cleanText(form.get("memo") || "");
  const squareId = cleanText(form.get("squareId") || "");
  const squareTitle = cleanText(form.get("squareTitle") || "");
  const file = form.get("photo");

  if (!squareId || !squareTitle || !file || typeof file === "string" || file.size === 0) {
    return json({ error: "빙고 칸과 사진을 모두 선택해 주세요." }, 400);
  }

  if (!file.type.startsWith("image/")) {
    return json({ error: "이미지 파일만 업로드할 수 있습니다." }, 400);
  }

  const id = crypto.randomUUID();
  const imageKey = `${Date.now()}-${id}${safeImageExtension(file.name, file.type)}`;
  await env.PHOTOS.put(imageKey, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  });

  const existing = await env.DB.prepare(
    "SELECT * FROM submissions WHERE user_id = ? AND square_id = ? LIMIT 1"
  ).bind(userId, squareId).first();

  if (existing) {
    await env.DB.prepare(
      `UPDATE submissions
       SET participant = ?, memo = ?, square_title = ?, image_key = ?, original_name = ?, updated_at = ?
       WHERE id = ?`
    ).bind(participant, memo, squareTitle, imageKey, file.name || "photo", new Date().toISOString(), existing.id).run();

    if (existing.image_key) {
      ctx.waitUntil(env.PHOTOS.delete(existing.image_key));
    }

    const updated = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(existing.id).first();
    return json(formatSubmission(updated));
  }

  const createdAt = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO submissions
      (id, user_id, participant, memo, square_id, square_title, image_key, original_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, participant, memo, squareId, squareTitle, imageKey, file.name || "photo", createdAt).run();

  const created = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  return json(formatSubmission(created), 201);
}

async function deleteSubmission(id, env) {
  const item = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
  if (!item) return json({ error: "Not found" }, 404);

  await env.DB.prepare("DELETE FROM submissions WHERE id = ?").bind(id).run();
  await env.PHOTOS.delete(item.image_key);
  return json({ ok: true });
}

async function servePhoto(key, env) {
  const object = await env.PHOTOS.get(decodeURIComponent(key));
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

function formatSubmission(row) {
  return {
    id: row.id,
    userId: row.user_id,
    participant: row.participant,
    memo: row.memo || "",
    squareId: row.square_id,
    squareTitle: row.square_title,
    imageUrl: `/uploads/${row.image_key}`,
    originalName: row.original_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
  };
}

function safeImageExtension(filename, type) {
  const ext = String(filename || "").match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return ext;
  if (type === "image/png") return ".png";
  if (type === "image/gif") return ".gif";
  if (type === "image/webp") return ".webp";
  return ".jpg";
}

function cleanText(value) {
  return String(value).trim().slice(0, 160);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}
