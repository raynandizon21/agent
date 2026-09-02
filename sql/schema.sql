CREATE DATABASE IF NOT EXISTS agent_telegram_inbox
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE agent_telegram_inbox;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  telegram_id BIGINT NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS message_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agent_id INT UNSIGNED NULL,
  telegram_chat_id BIGINT NOT NULL,
  telegram_user_id BIGINT NULL,
  telegram_username VARCHAR(64) NULL,
  message_text TEXT NOT NULL,
  telegram_message_id BIGINT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_received_at (received_at),
  INDEX idx_chat_id (telegram_chat_id),
  CONSTRAINT fk_message_agent
    FOREIGN KEY (agent_id) REFERENCES agents(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settlements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NULL,
  agent_id INT UNSIGNED NULL,
  junket VARCHAR(32) NOT NULL,
  account_no VARCHAR(120) NULL,
  account_name VARCHAR(255) NULL,
  player_name VARCHAR(512) NULL,
  game_no VARCHAR(64) NULL,
  buy_in BIGINT NULL,
  cashout BIGINT NULL,
  win_loss BIGINT NULL,
  rolling BIGINT NULL,
  commission BIGINT NULL,
  balance BIGINT NULL,
  settled_at DATETIME NULL,
  raw_text MEDIUMTEXT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'settled',
  step VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_settlements_created (created_at),
  INDEX idx_settlements_junket (junket),
  INDEX idx_settlements_account (account_no),
  INDEX idx_settlements_open_game (junket, account_no, game_no, status),
  CONSTRAINT fk_settlement_message
    FOREIGN KEY (message_id) REFERENCES message_logs(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_settlement_agent
    FOREIGN KEY (agent_id) REFERENCES agents(id)
    ON DELETE SET NULL
) ENGINE=InnoDB;
