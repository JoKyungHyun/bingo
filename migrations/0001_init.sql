CREATE TABLE IF NOT EXISTS board_items (
  idx INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  participant TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  square_id TEXT NOT NULL,
  square_title TEXT NOT NULL,
  image_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS submissions_user_square_idx
  ON submissions (user_id, square_id);

INSERT OR IGNORE INTO board_items (idx, title) VALUES
  (0, '아침'),
  (1, '동료와 셀카'),
  (2, '초록색 물건'),
  (3, '커피 한 잔'),
  (4, '웃긴 표정'),
  (5, '책 한 페이지'),
  (6, '운동 인증'),
  (7, '점심 메뉴'),
  (8, '손글씨'),
  (9, '창밖 풍경'),
  (10, '반려 식물'),
  (11, '팀 로고'),
  (12, '오늘의 신발'),
  (13, '간식 타임'),
  (14, '깨끗한 책상'),
  (15, '노을'),
  (16, '좋아하는 색'),
  (17, '물 마시기'),
  (18, '작은 성취'),
  (19, '퇴근길'),
  (20, '하트 모양'),
  (21, '추천 장소'),
  (22, '음악 듣기'),
  (23, '단체 사진'),
  (24, '자유 칸');
