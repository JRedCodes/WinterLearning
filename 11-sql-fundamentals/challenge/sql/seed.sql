-- Small, hand-written dataset. Small enough to reason about by hand,
-- big enough to have NULLs, ties, customers without orders and a 3-level category tree.
SET TIME ZONE 'UTC';

INSERT INTO categories (id, name, parent_id) VALUES
  (1,  'Electronics', NULL),
  (2,  'Computers',   1),
  (3,  'Laptops',     2),
  (4,  'Accessories', 2),
  (5,  'Phones',      1),
  (6,  'Home',        NULL),
  (7,  'Kitchen',     6),
  (8,  'Furniture',   6),
  (9,  'Books',       NULL),
  (10, 'Fiction',     9),
  (11, 'Programming', 9);

INSERT INTO customers (id, email, full_name, city, created_at) VALUES
  (1,  'alice@example.com', 'Alice Martin',  'Berlin', '2025-11-02 09:15:00+00'),
  (2,  'bob@example.org',   'Bob Chen',      'Paris',  '2025-11-20 18:40:00+00'),
  (3,  'carla@Example.ORG', 'Carla Rossi',   'Rome',   '2025-12-05 12:00:00+00'),
  (4,  'dev@example.com',   'Dev Patel',     NULL,     '2025-12-24 21:30:00+00'),
  (5,  'emma@example.net',  'Emma Schmidt',  'Berlin', '2026-01-03 08:05:00+00'),
  (6,  'farid@example.org', 'Farid Haddad',  'Paris',  '2026-01-15 14:20:00+00'),
  (7,  'grace@example.com', 'Grace Kim',     NULL,     '2026-02-01 10:00:00+00'),
  (8,  'hugo@example.net',  'Hugo Lefevre',  'Lyon',   '2026-02-11 16:45:00+00'),
  (9,  'ines@example.org',  'Ines Alves',    'Lisbon', '2026-03-02 11:11:00+00'),
  (10, 'jon@example.com',   'Jon Berg',      'Oslo',   '2026-03-28 07:30:00+00'),
  (11, 'kai@example.net',   'Kai Weber',     'Berlin', '2026-04-09 19:00:00+00'),
  (12, 'lena@EXAMPLE.com',  'Lena Novak',    'Prague', '2026-05-17 13:25:00+00');

INSERT INTO products (id, name, category_id, price, active) VALUES
  (1,  'Ultrabook 14',           3,    1299.00, true),
  (2,  'Gaming Laptop 16',       3,    1899.00, true),
  (3,  'Wireless Mouse',         4,      29.99, true),
  (4,  'Mechanical Keyboard',    4,      89.00, true),
  (5,  'USB-C Hub',              4,      39.50, true),
  (6,  'Smartphone X',           5,     799.00, true),
  (7,  'Budget Phone',           5,     199.00, false),
  (8,  'Espresso Machine',       7,     349.00, true),
  (9,  'Chef Knife',             7,      89.00, true),
  (10, 'Standing Desk',          8,     549.00, true),
  (11, 'Office Chair',           8,     299.00, true),
  (12, 'The Long Winter',        10,     18.50, true),
  (13, 'Mystery at Dawn',        10,     12.99, true),
  (14, 'Designing Data Systems', 11,     45.00, true),
  (15, 'Learning SQL',           11,     39.50, true),
  (16, 'Gift Card',              NULL,   50.00, true),
  (17, 'Monitor 27',             2,     329.00, true),
  (18, 'Laptop Sleeve',          4,      24.00, false);

INSERT INTO orders (id, customer_id, status, ordered_at, shipped_at) VALUES
  (1,  1, 'delivered', '2026-01-05 10:00:00+00', '2026-01-06 09:00:00+00'),
  (2,  2, 'delivered', '2026-01-12 15:30:00+00', '2026-01-13 11:00:00+00'),
  (3,  1, 'delivered', '2026-01-28 20:10:00+00', '2026-01-30 08:00:00+00'),
  (4,  3, 'cancelled', '2026-02-02 09:45:00+00', NULL),
  (5,  4, 'delivered', '2026-02-14 12:00:00+00', '2026-02-16 10:30:00+00'),
  (6,  5, 'delivered', '2026-02-20 18:00:00+00', '2026-02-21 17:00:00+00'),
  (7,  2, 'delivered', '2026-03-01 08:30:00+00', '2026-03-03 12:00:00+00'),
  (8,  6, 'delivered', '2026-03-09 13:15:00+00', '2026-03-10 09:00:00+00'),
  (9,  3, 'delivered', '2026-03-15 17:00:00+00', '2026-03-18 14:00:00+00'),
  (10, 7, 'cancelled', '2026-03-22 11:00:00+00', NULL),
  (11, 1, 'shipped',   '2026-04-02 09:00:00+00', '2026-04-03 15:00:00+00'),
  (12, 8, 'delivered', '2026-04-10 19:20:00+00', '2026-04-12 10:00:00+00'),
  (13, 5, 'delivered', '2026-04-18 10:10:00+00', '2026-04-19 16:00:00+00'),
  (14, 9, 'delivered', '2026-04-25 14:00:00+00', '2026-04-27 09:30:00+00'),
  (15, 4, 'shipped',   '2026-05-03 16:40:00+00', '2026-05-05 08:00:00+00'),
  (16, 2, 'paid',      '2026-05-11 12:30:00+00', NULL),
  (17, 6, 'delivered', '2026-05-19 09:00:00+00', '2026-05-21 13:00:00+00'),
  (18, 1, 'paid',      '2026-05-30 22:15:00+00', NULL),
  (19, 8, 'pending',   '2026-06-04 07:50:00+00', NULL),
  (20, 9, 'shipped',   '2026-06-09 18:05:00+00', '2026-06-10 12:00:00+00'),
  (21, 3, 'pending',   '2026-06-15 10:30:00+00', NULL),
  (22, 5, 'paid',      '2026-06-21 13:00:00+00', NULL);

-- unit_price is the price paid; it sometimes differs from today's list price (sales!).
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1,  1,  1, 1249.00), (1,  3,  1,   29.99),
  (2,  6,  1,  799.00), (2,  12, 2,   18.50),
  (3,  4,  1,   89.00), (3,  5,  2,   39.50),
  (4,  2,  1, 1899.00),
  (5,  8,  1,  349.00), (5,  9,  1,   89.00),
  (6,  14, 1,   45.00), (6,  15, 1,   39.50), (6, 13, 3, 12.99),
  (7,  10, 1,  549.00),
  (8,  1,  1, 1299.00), (8,  4,  1,   89.00),
  (9,  11, 2,  299.00),
  (10, 6,  1,  799.00),
  (11, 17, 2,  329.00),
  (12, 2,  1, 1799.00), (12, 3,  2,   29.99),
  (13, 8,  1,  349.00),
  (14, 14, 2,   45.00), (14, 12, 1,   18.50),
  (15, 6,  1,  749.00), (15, 5,  1,   39.50),
  (16, 16, 2,   50.00),
  (17, 9,  2,   89.00), (17, 15, 1,   39.50),
  (18, 3,  3,   29.99),
  (19, 10, 1,  549.00), (19, 11, 1,  299.00),
  (20, 13, 2,   12.99),
  (21, 4,  1,   89.00),
  (22, 17, 1,  329.00), (22, 3, 1, 29.99);

INSERT INTO reviews (id, product_id, customer_id, rating, body, created_at) VALUES
  (1,  1,  1, 5, 'Fast and light.',                 '2026-01-10 10:00:00+00'),
  (2,  3,  1, 4, NULL,                              '2026-01-10 10:05:00+00'),
  (3,  6,  2, 4, 'Great screen, battery so-so.',    '2026-01-20 19:00:00+00'),
  (4,  12, 2, 5, 'Could not put it down.',          '2026-01-25 21:00:00+00'),
  (5,  8,  12, 5, 'Best purchase this year.',       '2026-05-20 08:30:00+00'),
  (6,  9,  12, 3, 'Sharp, handle is slippery.',      '2026-05-21 08:30:00+00'),
  (7,  14, 5, 5, NULL,                              '2026-03-01 12:00:00+00'),
  (8,  13, 5, 2, 'Saw the twist coming.',           '2026-03-02 12:00:00+00'),
  (9,  1,  6, 4, 'Solid, a bit pricey.',            '2026-03-15 09:00:00+00'),
  (10, 11, 3, 4, 'Comfortable.',                    '2026-03-25 18:00:00+00'),
  (11, 2,  8, 5, 'Runs everything.',                '2026-04-15 20:00:00+00'),
  (12, 8,  5, 4, NULL,                              '2026-04-25 07:45:00+00'),
  (13, 14, 11, 4, 'Dense but worth it.',             '2026-05-01 22:10:00+00'),
  (14, 6,  11, 1, 'Never ordered, just angry.',     '2026-05-02 10:00:00+00'),
  (15, 9,  6, 5, 'Great knife.',                    '2026-05-25 11:00:00+00'),
  (16, 5,  1, 3, NULL,                              '2026-02-05 16:00:00+00');

SELECT setval(pg_get_serial_sequence('reviews', 'id'), (SELECT max(id) FROM reviews));
