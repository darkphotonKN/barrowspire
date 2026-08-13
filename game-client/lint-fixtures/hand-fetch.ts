// FIXTURE — must FAIL lint. Not imported by anything.
//
// A gate nobody has watched reject something is unverified configuration, so
// this file exists to be rejected. `npm run lint:fence` asserts it.
const API = "http://localhost:7114";

export async function bad() {
  const a = await fetch(`${API}/api/member`);
  const b = await fetch("/api/items/loadout");
  return [a, b];
}
