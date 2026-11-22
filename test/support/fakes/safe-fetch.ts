import { world } from "../world.ts";

/** Stand-in for the one-click unsubscribe request; the real one is covered by its own unit tests. */
export async function sendOneClickUnsubscribe(url: string) {
  world.oneClick.calls.push(url);
  return world.oneClick.respond(url);
}
