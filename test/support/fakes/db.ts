import { randomUUID } from "node:crypto";
import { world, type Row } from "../world.ts";

/**
 * In-memory stand-in for the Supabase client, covering the query-builder calls the app
 * makes. It applies the same rules as the migrations: users only see their own rows,
 * tables without a policy are off limits, unique constraints raise 23505, and
 * email_subscriptions.classification is computed like the generated column.
 */

type Access = "select" | "insert" | "update" | "delete";
type Role = { kind: "user" } | { kind: "service" };
type DbError = { code: string; message: string };
type Result = { data: unknown; error: DbError | null; count?: number | null };

type TableSpec = {
  key: string[];
  unique?: string[][];
  owner?: string;
  /** What a signed-in user may do under row level security. */
  user: Access[];
  defaults: () => Row;
  derive?: (row: Row) => void;
  partialUnique?: { columns: string[]; where: (row: Row) => boolean };
};

const all: Access[] = ["select", "insert", "update", "delete"];
const now = () => new Date().toISOString();

const schema: Record<string, TableSpec> = {
  gmail_connections: {
    key: ["id"], unique: [["user_id", "google_email"]], owner: "user_id", user: all,
    defaults: () => ({ id: randomUUID(), connected_at: now(), last_scan_at: null, last_scan_stats: null }),
  },
  sender_rules: {
    key: ["id"], unique: [["user_id", "kind", "match_type", "value"]], owner: "user_id", user: all,
    defaults: () => ({ id: randomUUID(), created_at: now() }),
  },
  unsubscribe_actions: {
    key: ["id"], owner: "user_id", user: ["select", "insert", "update"],
    defaults: () => ({ id: randomUUID(), account_email: null, list_id: null, detail: null, target_host: null, http_status: null, created_at: now(), updated_at: now() }),
    partialUnique: { columns: ["user_id", "sender_key"], where: (row) => row.status === "pending" },
  },
  user_plans: {
    key: ["user_id"], unique: [["stripe_customer_id"]], owner: "user_id", user: ["select"],
    defaults: () => ({ plan: "free", updated_at: now(), stripe_customer_id: null, stripe_subscription_id: null, subscription_status: null, current_period_end: null, cancel_at_period_end: false }),
  },
  unsubscribe_usage: {
    key: ["id"], owner: "user_id", user: ["select", "insert"],
    defaults: () => ({ id: randomUUID(), action_id: null, created_at: now() }),
  },
  email_subscriptions: {
    key: ["id"], unique: [["connection_id", "sender_key"]], owner: "user_id", user: all,
    defaults: () => ({ id: randomUUID(), list_id: null, reasons: [], protected_by: null, ignored: false, status: "active", status_changed_at: now(), unsubscribed_at: null, last_seen_at: now() }),
    derive: (row) => { row.classification = row.protected_by ? "protected" : row.base_classification; },
  },
  stripe_events: { key: ["id"], user: [], defaults: () => ({ received_at: now() }) },
  contact_messages: { key: ["id"], user: [], defaults: () => ({ id: randomUUID(), user_id: null, created_at: now() }) },
};

export function rows(table: string): Row[] {
  return (world.tables[table] ??= []);
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function project(row: Row, columns: string) {
  if (columns.trim() === "*") return clone(row);
  return Object.fromEntries(columns.split(",").map((column) => column.trim()).filter(Boolean).map((column) => [column, clone(row[column] ?? null)]));
}

function compare(a: unknown, b: unknown) {
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
}

/** Parses the PostgREST `or` syntax the app uses, e.g. `a.eq.x,and(b.eq.y,c.lt."z")`. */
function parseLogic(expression: string): (row: Row) => boolean {
  const parts: string[] = [];
  let depth = 0, current = "", quoted = false;
  for (const char of expression) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") { parts.push(current); current = ""; continue; }
    current += char;
  }
  parts.push(current);
  const tests = parts.map((part) => {
    const group = part.match(/^(and|or)\((.*)\)$/);
    if (group) {
      const inner = parseLogicList(group[2]);
      return group[1] === "and" ? (row: Row) => inner.every((check) => check(row)) : (row: Row) => inner.some((check) => check(row));
    }
    const [column, operator, ...rest] = part.split(".");
    const value = rest.join(".").replace(/^"(.*)"$/, "$1");
    return (row: Row) => {
      const cell = row[column];
      switch (operator) {
        case "eq": return String(cell) === value;
        case "neq": return String(cell) !== value;
        case "lt": return compare(cell, value) < 0;
        case "gt": return compare(cell, value) > 0;
        default: throw new Error(`Fake db: unsupported operator ${operator}`);
      }
    };
  });
  return (row) => tests.some((check) => check(row));
}

function parseLogicList(expression: string) {
  // Reuse the top-level splitter, then turn the OR of the list into separate checks.
  const parts: Array<(row: Row) => boolean> = [];
  let depth = 0, current = "", quoted = false;
  for (const char of expression) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") { parts.push(parseLogic(current)); current = ""; continue; }
    current += char;
  }
  parts.push(parseLogic(current));
  return parts;
}

class Query implements PromiseLike<Result> {
  private operation: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private filters: Array<(row: Row) => boolean> = [];
  private columns = "*";
  private counting = false;
  private head = false;
  private returning: string | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private sort: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private payload: Row | Row[] = {};
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  private table: string;
  private role: Role;

  constructor(table: string, role: Role) {
    if (!schema[table]) throw new Error(`Fake db: unknown table ${table}`);
    this.table = table;
    this.role = role;
  }

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    if (this.operation === "select") {
      this.columns = columns;
      this.counting = Boolean(options?.count);
      this.head = Boolean(options?.head);
    } else {
      this.returning = columns;
    }
    return this;
  }
  insert(payload: Row | Row[]) { this.operation = "insert"; this.payload = clone(payload); return this; }
  upsert(payload: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.operation = "upsert"; this.payload = clone(payload); this.upsertOptions = options; return this;
  }
  update(payload: Row) { this.operation = "update"; this.payload = clone(payload); return this; }
  delete() { this.operation = "delete"; return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value); return this; }
  gte(column: string, value: unknown) { this.filters.push((row) => compare(row[column], value) >= 0); return this; }
  lt(column: string, value: unknown) { this.filters.push((row) => compare(row[column], value) < 0); return this; }
  or(expression: string) { this.filters.push(parseLogic(expression)); return this; }
  order(column: string, options: { ascending?: boolean } = {}) { this.sort = { column, ascending: options.ascending ?? true }; return this; }
  limit(count: number) { this.max = count; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = Result, B = never>(onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.execute()).then(onFulfilled, onRejected);
  }

  private get spec() { return schema[this.table]; }
  private get userId() { return world.session; }

  private can(access: Access) {
    return this.role.kind === "service" || this.spec.user.includes(access);
  }

  /** Row level security: a user only ever sees rows they own. */
  private visible(row: Row) {
    if (this.role.kind === "service") return true;
    return Boolean(this.spec.owner) && row[this.spec.owner!] === this.userId;
  }

  private matching() {
    return rows(this.table).filter((row) => this.visible(row) && this.filters.every((check) => check(row)));
  }

  private shape(found: Row[], columns: string): Result {
    let list = found;
    if (this.sort) {
      const { column, ascending } = this.sort;
      list = [...list].sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1));
    }
    if (this.max !== null) list = list.slice(0, this.max);
    const projected = list.map((row) => project(row, columns));
    if (this.mode === "single") {
      return projected.length === 1 ? { data: projected[0], error: null } : { data: null, error: { code: "PGRST116", message: `Expected one row, found ${projected.length}` } };
    }
    if (this.mode === "maybe") {
      return projected.length <= 1 ? { data: projected[0] ?? null, error: null } : { data: null, error: { code: "PGRST116", message: "More than one row" } };
    }
    return { data: projected, error: null };
  }

  private violatesUnique(candidate: Row, ignore?: Row) {
    const existing = rows(this.table).filter((row) => row !== ignore);
    const keys = [this.spec.key, ...(this.spec.unique ?? [])];
    for (const columns of keys) {
      if (columns.some((column) => candidate[column] === null || candidate[column] === undefined)) continue;
      if (existing.some((row) => columns.every((column) => row[column] === candidate[column]))) return true;
    }
    const partial = this.spec.partialUnique;
    if (partial && partial.where(candidate) && existing.some((row) => partial.where(row) && partial.columns.every((column) => row[column] === candidate[column]))) return true;
    return false;
  }

  private rlsError(): Result {
    return { data: null, error: { code: "42501", message: `new row violates row-level security policy for table "${this.table}"` } };
  }

  /** Applies defaults and the insert policy; returns null when row level security refuses it. */
  private prepareInsert(input: Row): Row | null {
    const row = { ...this.spec.defaults(), ...input };
    if (this.spec.owner && row[this.spec.owner] === undefined && this.role.kind === "user") row[this.spec.owner] = this.userId;
    if (this.role.kind === "user" && (!this.can("insert") || (this.spec.owner && row[this.spec.owner] !== this.userId))) return null;
    this.spec.derive?.(row);
    return row;
  }

  private execute(): Result {
    const table = rows(this.table);
    switch (this.operation) {
      case "select": {
        if (!this.can("select")) return { data: this.mode === "many" ? [] : null, error: null, count: 0 };
        const found = this.matching();
        if (this.head) return { data: null, error: null, count: found.length };
        return { ...this.shape(found, this.columns), count: this.counting ? found.length : null };
      }
      case "insert": {
        const inserted: Row[] = [];
        for (const input of [this.payload].flat()) {
          const row = this.prepareInsert(input);
          if (!row) return this.rlsError();
          if (this.violatesUnique(row) || inserted.some((other) => this.spec.key.every((column) => other[column] === row[column]))) {
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${this.table}` } };
          }
          inserted.push(row);
        }
        table.push(...inserted);
        return this.returning === null ? { data: null, error: null } : this.shape(inserted, this.returning);
      }
      case "upsert": {
        const conflict = this.upsertOptions.onConflict?.split(",").map((column) => column.trim()) ?? this.spec.key;
        const written: Row[] = [];
        for (const input of [this.payload].flat()) {
          const candidate = { ...input };
          if (this.spec.owner && candidate[this.spec.owner] === undefined && this.role.kind === "user") candidate[this.spec.owner] = this.userId;
          const existing = table.find((row) => conflict.every((column) => row[column] === candidate[column]));
          if (existing) {
            if (this.upsertOptions.ignoreDuplicates) continue;
            if (this.role.kind === "user" && (!this.can("update") || !this.visible(existing))) return this.rlsError();
            Object.assign(existing, candidate);
            this.spec.derive?.(existing);
            written.push(existing);
          } else {
            const row = this.prepareInsert(candidate);
            if (!row) return this.rlsError();
            if (this.violatesUnique(row)) return { data: null, error: { code: "23505", message: "duplicate key" } };
            table.push(row);
            written.push(row);
          }
        }
        return this.returning === null ? { data: null, error: null } : this.shape(written, this.returning);
      }
      case "update": {
        if (!this.can("update")) return this.returning === null ? { data: null, error: null } : this.shape([], this.returning);
        const found = this.matching();
        for (const row of found) {
          Object.assign(row, this.payload);
          this.spec.derive?.(row);
        }
        return this.returning === null ? { data: null, error: null } : this.shape(found, this.returning);
      }
      case "delete": {
        if (!this.can("delete")) return { data: null, error: null };
        const found = new Set(this.matching());
        world.tables[this.table] = table.filter((row) => !found.has(row));
        // ON DELETE CASCADE from gmail_connections to email_subscriptions.
        if (this.table === "gmail_connections") {
          const ids = new Set([...found].map((row) => row.id));
          world.tables.email_subscriptions = rows("email_subscriptions").filter((row) => !ids.has(row.connection_id));
        }
        return { data: null, error: null };
      }
    }
  }
}

/** The submit_contact_message database function, including its rate limit. */
function submitContactMessage(args: Record<string, string>): Result {
  if (world.contact.failNext) {
    world.contact.failNext = false;
    return { data: null, error: { code: "57P01", message: "database unavailable" } };
  }
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const recent = rows("contact_messages").filter((row) => row.ip_hash === args.p_ip_hash && String(row.created_at) > hourAgo);
  if (recent.length >= 5) return { data: "rate_limited", error: null };
  rows("contact_messages").push({ ...schema.contact_messages.defaults(), name: args.p_name, email: args.p_email, message: args.p_message, user_id: world.session, ip_hash: args.p_ip_hash });
  return { data: "ok", error: null };
}

function currentUser() {
  const user = world.users.find((item) => item.id === world.session);
  return user ? { id: user.id, email: user.email } : null;
}

export function createFakeClient(role: Role) {
  return {
    from: (table: string) => new Query(table, role),
    rpc: async (name: string, args: Record<string, string>) => {
      if (name !== "submit_contact_message") throw new Error(`Fake db: unknown function ${name}`);
      return submitContactMessage(args);
    },
    auth: {
      async getUser() {
        return { data: { user: currentUser() }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const user = world.users.find((item) => item.email === email && item.password === password);
        if (!user) return { data: { session: null, user: null }, error: { message: "Invalid login credentials" } };
        world.session = user.id;
        return { data: { session: { user }, user }, error: null };
      },
      async signUp({ email, password }: { email: string; password: string }) {
        if (world.users.some((item) => item.email === email)) {
          return { data: { session: null, user: null }, error: { message: "User already registered" } };
        }
        const user = { id: randomUUID(), email, password };
        world.users.push(user);
        if (world.auth.confirmEmail) return { data: { session: null, user }, error: null };
        world.session = user.id;
        return { data: { session: { user }, user }, error: null };
      },
      async signOut() {
        world.session = null;
        return { error: null };
      },
      async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
        world.auth.resetRequests.push({ email, redirectTo: options?.redirectTo });
        return { data: {}, error: null };
      },
      async updateUser({ password }: { password: string }) {
        const user = world.users.find((item) => item.id === world.session);
        if (!user) return { data: { user: null }, error: { message: "Not signed in" } };
        user.password = password;
        return { data: { user }, error: null };
      },
    },
  };
}
