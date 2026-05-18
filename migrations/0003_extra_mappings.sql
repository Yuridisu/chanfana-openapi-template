-- migrations/0003_extra_mappings.sql
-- Adiciona suporte a múltiplos mapeamentos de campo dinheiro → campo extenso

ALTER TABLE installations ADD COLUMN extra_mappings TEXT NOT NULL DEFAULT '[]';
