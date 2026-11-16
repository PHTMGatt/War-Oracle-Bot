// Minimal Clash of Clans API client (built-in fetch, no extra dependency).
// Note: Supercell keys are locked to the public IP(s) you register, so a new host needs a new key.
const BASE = 'https://api.clashofclans.com/v1';

function createClient({ token, clanTag, fetchImpl = fetch }) {
  async function currentWar() {
    if (!token) throw Object.assign(new Error('COC_TOKEN is not set'), { status: 0 });
    if (!clanTag) throw Object.assign(new Error('CLAN_TAG is not set'), { status: 0 });
    const res = await fetchImpl(`${BASE}/clans/${clanTag}/currentwar`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw Object.assign(new Error(`CoC API ${res.status}: ${text.slice(0, 160)}`), { status: res.status });
    }
    return res.json();
  }
  return { currentWar };
}

module.exports = { createClient };
