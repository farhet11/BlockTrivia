-- Add optional explanation field to questions
-- Run in Supabase SQL Editor: Dashboard > SQL Editor

alter table questions
  add column if not exists explanation text;
