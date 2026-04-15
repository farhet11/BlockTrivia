-- Migration 061: Pixel Reveal — per-question reveal_mode
--
-- Adds questions.reveal_mode so hosts can pick between the two Pixel Reveal
-- reveal mechanics on a per-question basis:
--
--   'pixelated'  (default) — canvas downscale→upscale, classic blocky reveal.
--                             Great when the image is a texture or scene
--                             where color/shape blobs hint at the answer.
--
--   'tile_reveal'          — 8×8 grid; tiles random-reveal over the timer.
--                             Better for logos: shape silhouette stays hidden
--                             until enough tiles uncover, so fast guessers
--                             don't get free wins from a recognisable outline.
--
-- Default is 'pixelated' so existing Pixel Reveal questions keep their
-- behaviour with zero rewrite.
--
-- Column added to `questions` alongside existing `image_url` (migration 054).

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS reveal_mode text
    NOT NULL
    DEFAULT 'pixelated'
    CHECK (reveal_mode IN ('pixelated', 'tile_reveal'));

COMMENT ON COLUMN questions.reveal_mode IS
  'Pixel Reveal round only — which reveal mechanic to use for this question. '
  'Other round types ignore this column.';
