import { world } from "../world.ts";

/** Stand-in for next/headers: one browser's cookie jar, shared across requests. */
export async function cookies() {
  return {
    get: (name: string) => (world.cookies.has(name) ? { name, value: world.cookies.get(name)! } : undefined),
    getAll: () => [...world.cookies].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => { world.cookies.set(name, value); },
    delete: (nameOrOptions: string | { name: string }) => { world.cookies.delete(typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name); },
  };
}

export async function headers() {
  return new Headers();
}
