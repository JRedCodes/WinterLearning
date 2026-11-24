-- Exercise 11 · Dates
-- Monthly revenue report. Revenue only counts orders that are NOT cancelled.
-- All timestamps are in UTC (the test session runs with TimeZone = 'UTC').
-- Columns:  month    text like '2026-01' (hint: to_char / date_trunc)
--           orders   number of (non-cancelled) orders placed that month
--           revenue  sum of quantity * unit_price for those orders
-- Order:    month ascending.
-- Watch out: joining order_items multiplies order rows; count orders carefully.

