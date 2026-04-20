-- migrations/0001_installations.sql
-- Armazena os dados OAuth de cada cliente que instalar o app

CREATE TABLE IF NOT EXISTS installations (
  domain           TEXT PRIMARY KEY,
  member_id        TEXT NOT NULL,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT NOT NULL,
  expires_at       INTEGER NOT NULL,   -- Unix timestamp
  client_endpoint  TEXT NOT NULL,      -- Ex: https://dominio.bitrix24.com.br/rest/
  field_extenso    TEXT NOT NULL DEFAULT 'UF_CRM_VALOR_EXTENSO',
  installed_at     INTEGER NOT NULL
);
