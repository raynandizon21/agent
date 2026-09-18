CREATE DATABASE IF NOT EXISTS agent_telegram_inbox
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE agent_telegram_inbox;

-- Column names are ALL_CAPS with the primary key as IDNo and any foreign
-- key right after it, matching this org's usual DB convention (see e.g.
-- the junket system's own tables). The Node app aliases every query back
-- to lowercase keys (id, name, telegram_id, ...) so this is purely a DB-
-- level convention — no API/frontend shape depends on it.

CREATE TABLE IF NOT EXISTS users (
  IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- NULL = admin login (sees every agent's data). Set = scoped to that one
  -- agent's messages/settlements only. No FK constraint, same as AGENT_ID
  -- on message_logs/settlements below.
  AGENT_ID INT UNSIGNED NULL,
  USERNAME VARCHAR(64) NOT NULL UNIQUE,
  PASSWORD_HASH VARCHAR(255) NOT NULL,
  CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agents (
  IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  NAME VARCHAR(120) NOT NULL,
  TELEGRAM_ID BIGINT NOT NULL UNIQUE,
  IS_ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
  CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS guests (
  IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- The agent who onboarded/owns this guest. A scoped agent login only ever
  -- sees and edits their own guests (see guestModel/guestController); an
  -- admin login sees and can assign/reassign all. NULL = unowned (an admin
  -- created it without picking an agent).
  AGENT_ID INT UNSIGNED NULL,
  TELEGRAM_ID BIGINT NULL,
  GUEST_CODE VARCHAR(64) NULL,
  GUEST_NAME VARCHAR(120) NOT NULL,
  ENCODED_BY VARCHAR(64) NOT NULL,
  ENCODED_DT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  EDITED_BY VARCHAR(64) NULL,
  EDITED_DT TIMESTAMP NULL,
  ACTIVE TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_guests_code (GUEST_CODE),
  UNIQUE KEY uq_guests_telegram_id (TELEGRAM_ID),
  CONSTRAINT fk_guest_agent
    FOREIGN KEY (AGENT_ID) REFERENCES agents(IDNo)
    ON DELETE SET NULL
) ENGINE=InnoDB;

-- A guest can play across several junkets, so this is many-to-many rather
-- than a column on guests. ACCOUNT_NO optionally links to that junket's
-- real account number (as seen in settlements).
CREATE TABLE IF NOT EXISTS guest_junkets (
  IDNo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  GUEST_ID INT UNSIGNED NOT NULL,
  JUNKET VARCHAR(32) NOT NULL,
  ACCOUNT_NO VARCHAR(120) NULL,
  -- Commission rate as a percentage (e.g. 1.430 = 1.43%). Saving a guest
  -- with this set recomputes COMMISSION = BUY_IN * rate/100 on every
  -- existing settlement row for that (JUNKET, ACCOUNT_NO) — see
  -- guestController.recomputeCommission.
  COMMISSION_RATE DECIMAL(6,3) NULL,
  UNIQUE KEY uq_guest_junkets_pair (GUEST_ID, JUNKET),
  CONSTRAINT fk_guest_junkets_guest
    FOREIGN KEY (GUEST_ID) REFERENCES guests(IDNo)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Singleton row (IDNo=1) — there's only ever one bot.
CREATE TABLE IF NOT EXISTS bot_config (
  IDNo TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  BOT_TOKEN VARCHAR(255) NULL,
  UPDATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS message_logs (
  IDNo BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  AGENT_ID INT UNSIGNED NULL,
  TELEGRAM_CHAT_ID BIGINT NOT NULL,
  TELEGRAM_USER_ID BIGINT NULL,
  TELEGRAM_USERNAME VARCHAR(64) NULL,
  MESSAGE_TEXT TEXT NOT NULL,
  TELEGRAM_MESSAGE_ID BIGINT NULL,
  RECEIVED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_received_at (RECEIVED_AT),
  INDEX idx_chat_id (TELEGRAM_CHAT_ID),
  -- Guards against re-processing the same Telegram update twice (e.g. a
  -- server restart re-delivering an unconfirmed long-poll offset).
  UNIQUE KEY uq_message_logs_chat_msg (TELEGRAM_CHAT_ID, TELEGRAM_MESSAGE_ID),
  CONSTRAINT fk_message_agent
    FOREIGN KEY (AGENT_ID) REFERENCES agents(IDNo)
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settlements (
  IDNo BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  MESSAGE_ID BIGINT UNSIGNED NULL,
  AGENT_ID INT UNSIGNED NULL,
  JUNKET VARCHAR(32) NOT NULL,
  ACCOUNT_NO VARCHAR(120) NULL,
  ACCOUNT_NAME VARCHAR(255) NULL,
  PLAYER_NAME VARCHAR(512) NULL,
  GAME_NO VARCHAR(64) NULL,
  BUY_IN BIGINT NULL,
  CASHOUT BIGINT NULL,
  WIN_LOSS BIGINT NULL,
  ROLLING BIGINT NULL,
  COMMISSION BIGINT NULL,
  BALANCE BIGINT NULL,
  SETTLED_AT DATETIME NULL,
  RAW_TEXT MEDIUMTEXT NULL,
  STATUS VARCHAR(16) NOT NULL DEFAULT 'settled',
  STEP VARCHAR(32) NULL,
  CREATED_AT TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_settlements_created (CREATED_AT),
  INDEX idx_settlements_junket (JUNKET),
  INDEX idx_settlements_account (ACCOUNT_NO),
  INDEX idx_settlements_open_game (JUNKET, ACCOUNT_NO, GAME_NO, STATUS),
  CONSTRAINT fk_settlement_message
    FOREIGN KEY (MESSAGE_ID) REFERENCES message_logs(IDNo)
    ON DELETE SET NULL,
  CONSTRAINT fk_settlement_agent
    FOREIGN KEY (AGENT_ID) REFERENCES agents(IDNo)
    ON DELETE SET NULL
) ENGINE=InnoDB;
