-- Sample rows for the Veritas schema: ten banks, ten accounts, ten transactions.
-- One company, one currency (INR). account_number and utr_number are sensitive
-- and are masked everywhere outside this file.

CREATE TABLE IF NOT EXISTS bank (
  bank_code VARCHAR(8) PRIMARY KEY,
  bank_name VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  account_id VARCHAR(64) PRIMARY KEY,
  entity_id VARCHAR(64) NOT NULL,
  account_number VARCHAR(32) NOT NULL,
  program_id VARCHAR(32),
  available_balance DECIMAL(18,2) NOT NULL,
  bank_code VARCHAR(8) NOT NULL REFERENCES bank(bank_code)
);

CREATE TABLE IF NOT EXISTS transaction (
  transaction_id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL REFERENCES account(account_id),
  transaction_date TIMESTAMP NOT NULL,
  transaction_type VARCHAR(6) NOT NULL,
  description TEXT,
  transaction_amount DECIMAL(15,2) NOT NULL,
  transaction_reference_id VARCHAR(64),
  utr_number VARCHAR(256)
);

INSERT INTO bank (bank_code, bank_name) VALUES
  ('HDFC', 'HDFC Bank'),
  ('ICIC', 'ICICI Bank'),
  ('SBIN', 'State Bank of India'),
  ('UTIB', 'Axis Bank'),
  ('KKBK', 'Kotak Mahindra Bank'),
  ('YESB', 'Yes Bank'),
  ('IDFB', 'IDFC First Bank'),
  ('INDB', 'IndusInd Bank'),
  ('BARB', 'Bank of Baroda'),
  ('PUNB', 'Punjab National Bank');

INSERT INTO account (account_id, entity_id, account_number, program_id, available_balance, bank_code) VALUES
  ('acc-0001', 'ent-0001', '50100247319069', 'PRG-PAYOUT', 4820115.40, 'HDFC'),
  ('acc-0002', 'ent-0001', '50100247312244', 'PRG-PAYOUT', 1290480.00, 'HDFC'),
  ('acc-0003', 'ent-0001', '000405001284', 'PRG-COLLECT', 7311902.75, 'ICIC'),
  ('acc-0004', 'ent-0002', '38217740065', 'PRG-PAYOUT', 2044530.10, 'SBIN'),
  ('acc-0005', 'ent-0002', '917020041185522', 'PRG-COLLECT', 655120.00, 'UTIB'),
  ('acc-0006', 'ent-0002', '2611430098', 'PRG-PAYOUT', 188742.65, 'KKBK'),
  ('acc-0007', 'ent-0003', '004881900001196', 'PRG-COLLECT', 9902314.00, 'YESB'),
  ('acc-0008', 'ent-0003', '10054321987654', 'PRG-PAYOUT', 372900.25, 'IDFB'),
  ('acc-0009', 'ent-0004', '201004556677', 'PRG-PAYOUT', 1450000.00, 'INDB'),
  ('acc-0010', 'ent-0004', '31220100004512', 'PRG-COLLECT', 88015.50, 'BARB');

INSERT INTO transaction (transaction_id, account_id, transaction_date, transaction_type, description, transaction_amount, transaction_reference_id, utr_number) VALUES
  ('txn-000001', 'acc-0001', '2026-06-24 18:24:06', 'debit',  'FT -  95842568 -  50100247319069 - SELECTION ELECTRONICS   MUMBAI', 14866.00, '1715499972', 'YmFua3JlZjAwMXA2'),
  ('txn-000002', 'acc-0001', '2026-06-22 11:02:41', 'debit',  'NEFT  - HDFC0000123 - 84512097 - 50100247319069 - PARESH VIKRANT GHASE', 245000.00, '1715488310', NULL),
  ('txn-000003', 'acc-0002', '2026-06-19 09:47:15', 'debit',  'NEFT/N226191188422/ICIC/SELECTION MOBILE', 78250.50, '1715470044', 'YmFua3JlZjAwM3Ex'),
  ('txn-000004', 'acc-0003', '2026-06-18 15:33:52', 'credit', 'R/UTIB0000042/CMS8841//RELIANCEDIGITAL RETAIL PRIVATE LIMITED/CMS8841 /RELIANCEDIGITAL RETAIL PRIVATE LIMITED', 1875400.00, '1715461190', NULL),
  ('txn-000005', 'acc-0004', '2026-06-15 20:11:09', 'debit',  'IMPS/P2A/516611904477/KKBK/261143009812345/00/INET/8841/UMANGSELECTION/DPF10129/INWD48', 32500.00, '1715440071', 'YmFua3JlZjAwNXI3'),
  ('txn-000006', 'acc-0005', '2026-06-12 08:05:33', 'credit', 'UPI-SELECTION MALIGAI-XXXXXX4471-UTIB0000042-411920883107-772104558930112', 4990.00, NULL, NULL),
  ('txn-000007', 'acc-0006', '2026-06-10 13:26:47', 'debit',  'IMPS OW/238104556621/Gautam singh/YESB/26114300981', 61200.75, '1715401255', 'YmFua3JlZjAwN3M0'),
  ('txn-000008', 'acc-0007', '2026-06-08 17:58:20', 'debit',  'NEFT charges', 118.00, '1715390088', NULL),
  ('txn-000009', 'acc-0008', '2026-06-05 10:14:02', 'credit', 'Cheque Deposits', 500000.00, '1715370921', 'YmFua3JlZjAwOXQy'),
  ('txn-000010', 'acc-0009', '2026-06-02 12:41:38', 'debit',  'MISC ADJ 8812', 2350.00, NULL, NULL);
