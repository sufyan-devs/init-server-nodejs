# High-Traffic Performance Practices (stack-agnostic)

> **The third companion file.**
> [project-structure.md](project-structure.md) = *where code goes.*
> [coding-practices.md](coding-practices.md) = *how to write clean code.*
> **This file = how to make it FAST under infinite/high traffic.**
>
> These are **universal principles** — they hold for **any** database (MongoDB,
> PostgreSQL, MySQL, SQL Server, Cassandra…), **any** ORM/driver (Mongoose, Prisma,
> TypeORM, Sequelize, Drizzle, raw SQL), and **any** framework (Express, NestJS,
> Fastify) or topology (monolith or microservices). The *idea* is the same
> everywhere; only the *syntax* differs. Each rule shows the **SQL** and the
> **NoSQL/Mongo** form side by side. Sources at the bottom.

---

## The One Law (true on every stack)

> **Let the database do the work. The application just orchestrates.**
> Filtering, joining, sorting, counting, grouping, math, deduping — every database
> engine is built to do these next to the data, using indexes, without shipping rows
> over the wire. An application-side `for`/`map`/`foreach` loop that re-does the DB's
> job pulls everything into app memory and (in single-threaded runtimes like Node)
> blocks the event loop. This is language- and DB-independent.

Everything below is a corollary of that law.

---

## 1. No Loops Over Data in a Request — push it to the DB

The #1 killer of any high-traffic API, in any language, is looping over rows in app
code to filter, join, sum, or transform. The engine does all of that in one query.

| You're tempted to loop to... | SQL (Postgres/MySQL/…) | NoSQL (MongoDB) |
|------------------------------|------------------------|------------------|
| Filter a list | `WHERE` | `$match` / `find()` |
| Join another table/collection | `JOIN` | `$lookup` (after paging — §3) |
| Sum / count / average | `SUM() / COUNT() / AVG()` + `GROUP BY` | `$group` + `$sum`/`$avg` |
| Sort | `ORDER BY` (indexed) | `$sort` (indexed) |
| Pick fields | `SELECT col1, col2` | `$project` / `select()` |
| Conditional value | `CASE WHEN` | `$cond` / `$switch` |
| Counts per category | `GROUP BY status` | `$group` by `status` |

```
❌ ANY stack — pull every row, loop in app memory (blocks/bloats)
   rows = db.getAllCoupons()            // could be millions
   totals = {}
   for (r of rows) totals[r.status]++   // app does the DB's job

✅ SQL                                   ✅ Mongo
   SELECT status, COUNT(*)               db.coupons.aggregate([
   FROM coupons GROUP BY status;           { $group: { _id:'$status', n:{ $sum:1 } } }
                                          ])
```

> Rule: **if a loop's body touches the DB, or re-implements filter/join/sum/sort, it
> belongs in a query — regardless of language or ORM.**

---

## 2. The N+1 Query Problem — never query inside a loop

Querying the DB *inside* a loop = 1 query for the list + N for the children = "N+1".
Universal anti-pattern; every ORM has a name and a fix for it.

```
❌ N+1 — one query per row (kills throughput as data grows)
   coupons = repo.findCoupons()
   for (c of coupons) c.owner = repo.findUser(c.userId)   // N round-trips
```

**The fix, by stack — all express the same idea (batch / join once):**

| Stack | One-query fix |
|-------|---------------|
| **SQL (raw)** | `JOIN users u ON u.id = c.user_id` |
| **Prisma** | `prisma.coupon.findMany({ include: { owner: true } })` |
| **TypeORM** | `find({ relations: { owner: true } })` or `leftJoinAndSelect` |
| **Sequelize** | `findAll({ include: [User] })` |
| **Mongoose** | `.populate('owner')` *or* batch: `User.find({ _id: { $in: ids } })` |
| **GraphQL** | **DataLoader** (batches + caches per request) |

```
✅ batch with IN (any stack), then map in memory — O(1) lookups, no DB in the loop
   ids   = coupons.map(c => c.userId)
   users = repo.findUsers({ id: IN(ids) })          // ONE extra query
   byId  = index(users, 'id')
   coupons.forEach(c => c.owner = byId[c.userId])    // pure CPU on a small set
```

> The in-memory `map`/`forEach` here is fine — it's pure CPU on an already-fetched
> set. The sin is the **query** inside the loop.

---

## 3. Paginate & filter BEFORE you JOIN — stage/clause order is everything

This is the thing you asked about, and it's universal. If the join runs before the
limit, you join the *whole* table and throw 99% away.

```
❌ join everything, then keep 20  (full scan, huge waste — SQL & Mongo alike)
   ... JOIN ... ORDER BY created_at DESC LIMIT 20   -- engine may join all first
```

**SQL fix — limit in a subquery/CTE first, then join the survivors:**
```sql
SELECT c.*, u.name
FROM (
  SELECT * FROM coupons
  WHERE status = 'PUBLISHED'
  ORDER BY created_at DESC
  LIMIT 20 OFFSET 0            -- 1. filter + sort + paginate FIRST
) c
JOIN users u ON u.id = c.user_id;   -- 2. join only the 20
```

**Mongo fix — order the pipeline stages explicitly:**
```
$match → $sort → $skip → $limit → $lookup → $project
(filter+paginate first;  join+reshape last)
```

> ⚠️ **The one exception (both stacks):** if you must **filter or sort by a joined
> field** ("coupons whose *owner* is in Texas"), you can't defer the join — you'd
> only filter the first page. Then either push the filter into the join (SQL `WHERE`
> on the joined table / Mongo `$lookup` sub-pipeline), or **denormalize** that field
> onto the main row so the join isn't needed on the hot path.

---

## 4. Index for the query (ESR order works everywhere)

A filter/sort without a supporting index is a **full scan** — fatal at scale, on any
engine. Build a **composite/compound index** in the order **Equality → Sort → Range
(ESR)**. (MongoDB names this rule; SQL B-tree indexes follow the exact same logic —
leftmost-prefix.)

```
query: status = X (equality), ORDER BY created_at (sort), date range (range)

✅ SQL:    CREATE INDEX ix ON coupons (status, created_at, start_date);
✅ Mongo:  schema.index({ status: 1, createdAt: -1, startDate: 1 });
           //              equality   sort          range
```

Rules (all stacks):
- **Equality columns first**, then the **sort** column, then **range** last.
- A join's foreign key **must be indexed** or every join row is a scan.
- Verify with the planner: SQL `EXPLAIN ANALYZE` / Mongo `.explain('executionStats')`.
  You want an **index scan**, never a **full table/collection scan**.
- Don't over-index: each index slows writes and uses RAM. Index what you actually query.

---

## 5. Read-heavy routes: fetch lean + project only needed columns

Two cheap wins on any read-only endpoint:

- **Select only the columns you need** — never `SELECT *` / never return whole docs.
- **Skip ORM object hydration** when you only read:

| Stack | "Give me plain data, don't hydrate" |
|-------|--------------------------------------|
| **Mongoose** | `.lean()` (community benchmarks: 2–5× faster, ~3–10× less memory) |
| **Prisma** | `select: { ... }` (returns plain objects already) |
| **TypeORM** | `.getRawMany()` / `select: [...]` |
| **Sequelize** | `raw: true, attributes: [...]` |
| **Raw SQL** | naturally plain rows — just name the columns |

```
❌ SELECT *  /  Model.find()            → full rows, full hydration
✅ SELECT title, code, discount …       → only what the response needs
   + lean/raw to skip object wrapping
```

---

## 6. Pagination: prefer cursor (keyset) over deep OFFSET/skip

`OFFSET n` / `skip(n)` still **walks past** all n rows — page 1 fast, page 5,000 slow,
and it degrades as users go deeper. For large/infinite lists, use **cursor / keyset**
pagination (remember the last sort key, ask for the next slice). Universal across DBs.

```
❌ deep offset — O(offset), degrades with depth
   SQL:   ... ORDER BY created_at DESC LIMIT 20 OFFSET 100000;
   Mongo: .sort({createdAt:-1}).skip(100000).limit(20)

✅ keyset — O(limit), constant speed at any depth (needs an index on the key)
   SQL:   ... WHERE created_at < :lastSeen ORDER BY created_at DESC LIMIT 20;
   Mongo: .find({ createdAt: { $lt: lastSeen } }).sort({createdAt:-1}).limit(20)
```

- Small admin tables → offset/skip is fine and simpler.
- Large/public/infinite-scroll → cursor pagination, and **always cap the limit**
  (e.g. max 100) so no client can request the whole table.

---

## 7. Never block the runtime / event loop

Node (Express/NestJS/Fastify) handles "infinite" concurrent requests *because* each
callback finishes fast on one thread — one slow synchronous op freezes **every**
in-flight request. (Thread-pool runtimes like Java/.NET don't freeze globally, but a
slow request still ties up a worker thread — the lesson generalizes: keep request
work short.)

- ❌ Synchronous file/crypto reads, `JSON.parse` on huge payloads, giant in-app sorts.
- ❌ CPU-heavy / catastrophic-backtracking regex (ReDoS).
- ✅ Always `await` async I/O; never use `*Sync` APIs on the request path.
- ✅ Offload heavy CPU work (image processing, big reports, exports) to a **worker
  thread** or a **background job/queue** (BullMQ, Sidekiq, Celery, SQS…). Respond
  fast, process later. In **microservices**, this is a dedicated worker service.
- ✅ **Stream** large responses/files instead of buffering them fully in memory.

```
❌ a 2s CPU loop on the request path freezes the server for ALL users for 2s
✅ queue.add('build-report', { userId });  return 202 Accepted / { status:'queued' }
```

---

## 8. Cache hot reads — don't recompute what rarely changes

For data read far more than written (published lists, config, dashboards), cache the
result with a TTL instead of hitting the DB every request. DB- and framework-neutral.

- **Cache-aside** pattern: check cache → miss → query DB → store in cache.
- **Invalidate on write** when the underlying data changes.
- Always set a **TTL**; namespace keys (`coupons:published:*`).
- Layers (use what fits): in-process cache → **Redis/Memcached** (shared) → CDN/reverse
  proxy for public GETs. NestJS has a built-in `CacheModule`; Express uses a Redis client.
- In **microservices**, prefer a *shared* cache (Redis) so instances stay consistent.

---

## 9. Connection pooling, replicas, small payloads

- **Reuse a connection pool** — connect once at startup, never per request. True for
  every driver/ORM (Mongoose, Prisma, node-postgres, etc.). Tune pool size to traffic.
- **Read replicas / read scaling** for read-heavy load: reads → replicas, writes →
  primary. (Mongo replica set secondaries; SQL read replicas.)
- **Keep payloads small** — projection + pagination + gzip/br compression.
- **Transactions only when needed** (multi-row/multi-service writes); they cost more,
  so don't wrap single writes. In microservices, cross-service consistency uses the
  **Saga** pattern (events + compensations), not a distributed transaction.

---

## 10. Measure, don't guess (every stack has the tools)

- **Read the query plan**: SQL `EXPLAIN ANALYZE`, Mongo `.explain('executionStats')`.
  Compare rows examined vs rows returned — examining 100k to return 20 = missing index.
- Log **slow queries**; watch **event-loop lag** (Node) / thread-pool saturation.
- **Load-test** the endpoint (k6, autocannon, JMeter) before calling it "scalable".
- Add **tracing/metrics** (OpenTelemetry) — essential in microservices to find the
  slow hop. Optimize the bottleneck the numbers show, not a guessed one.

---

## Quick Reference — the winners' checklist (any DB / ORM / framework)

- [ ] No app-side loop doing filter/join/sum/sort the DB could do.
- [ ] No DB query **inside** a loop (N+1) — batch with `IN` / `JOIN` / `include` / DataLoader.
- [ ] Filter, sort, and **paginate BEFORE** joining (unless filtering by a joined field).
- [ ] Every filter/sort/foreign-key is backed by an index in **ESR** order.
- [ ] Query planner shows an **index scan**, not a full scan.
- [ ] Read-only endpoints select only needed columns + skip ORM hydration (lean/raw).
- [ ] Large lists use **cursor** pagination; limit is always capped.
- [ ] No `*Sync` / heavy CPU / ReDoS on the request path; heavy work → worker/queue.
- [ ] Large data is **streamed**, not buffered.
- [ ] Hot reads cached (shared cache for multi-instance/microservices) with TTL + invalidation.
- [ ] Connection **pooled** once; reads can use replicas; payloads compressed.
- [ ] Plan read/measured before declaring "scalable"; tracing in place for microservices.

---

## One-Sentence Summary

> **On every stack — any DB, any ORM, Express/NestJS, monolith or microservices —
> push every filter, join, sort, count, and calculation into the indexed database
> query; paginate and filter before you join; never loop or query inside a loop; keep
> reads lean and cached; and never block the runtime — so the app stays a thin, fast
> orchestrator that scales to effectively infinite requests.**

---

## Where to confirm the exact syntax (no hard-coded links)

The **principles** above are universal and don't change. The **exact commands,
operators, and flags do** — they differ per engine and per version. So don't rely on
links that rot; instead, **search the official docs of the specific tool + version you
are actually running.** Check your `package.json` / lockfile for the version first.

Search these official sources for your stack:

- **Your database** — the official manual for *your version* (e.g. "PostgreSQL 16
  query planning / `EXPLAIN ANALYZE`", "MySQL 8 composite index", "MongoDB 8
  aggregation pipeline optimization"). Topics to look up: *index design*,
  *query planner/EXPLAIN*, *aggregation/JOIN order*, *pagination*.
- **Your ORM/driver** — its official docs for *your version* (Prisma / TypeORM /
  Sequelize / Mongoose / the native driver). Topics: *select/projection*,
  *relations/joins/`include`*, *raw/lean queries*, *connection pool settings*.
- **Your runtime/framework** — Node.js docs ("Don't block the event loop"),
  NestJS ("Caching", "Performance"), or your framework's performance guide.
- **Cross-cutting concepts** — search the concept name plus "best practices" for
  current community write-ups: *N+1 query*, *DataLoader*, *cursor vs offset
  pagination*, *cache-aside*, *Saga pattern*.

> **Rule:** before using a specific operator/flag, verify it against the docs for the
> **version pinned in this project**, not a random blog or an older major version.
