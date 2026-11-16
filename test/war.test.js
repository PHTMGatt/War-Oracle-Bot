const test = require('node:test');
const assert = require('node:assert/strict');
const { load, normalizeClanTag, parseMinutes } = require('../src/config');
const { createClient } = require('../src/coc');
const { parseTime, remainingAttacks, dueThresholds, warStatusEmbed, warStatsEmbed, alertEmbed } = require('../src/war');
const { definitions } = require('../src/commands');

const war = (over = {}) => ({
  state: 'inWar',
  attacksPerMember: 2,
  startTime: '20261115T040000.000Z',
  endTime: '20261116T040000.000Z',
  clan: { name: 'Us', stars: 10, destructionPercentage: 55.5, members: [
    { name: 'Bee', attacks: [{}] },
    { name: 'Ann', attacks: [] },
    { name: 'Cy', attacks: [{}, {}] },
  ] },
  opponent: { name: 'Them' },
  ...over,
});

test('parseTime handles the CoC compact format and ISO', () => {
  assert.equal(parseTime('20261116T043000.000Z').toISOString(), '2026-11-16T04:30:00.000Z');
  assert.equal(parseTime('2026-11-16T04:30:00Z').toISOString(), '2026-11-16T04:30:00.000Z');
  assert.equal(parseTime('nope'), null);
  assert.equal(parseTime(undefined), null);
});

test('remainingAttacks counts and sorts', () => {
  const r = remainingAttacks(war());
  assert.equal(r.total, 3);
  assert.deepEqual(r.remaining.map((x) => x.name), ['Ann', 'Bee']);
});

test('dueThresholds fires each threshold once per war, only in war', () => {
  const fired = new Set();
  const args = { war: war(), clanTag: '%23X', thresholds: [720, 120, 30], fired };
  const at = (mins) => new Date(Date.parse('2026-11-16T04:00:00Z') - mins * 60000).getTime();
  assert.deepEqual(dueThresholds({ ...args, now: at(800) }), []);
  assert.deepEqual(dueThresholds({ ...args, now: at(100) }), [720, 120]);
  assert.deepEqual(dueThresholds({ ...args, now: at(100) }), []);
  assert.deepEqual(dueThresholds({ ...args, now: at(10) }), [30]);
  assert.deepEqual(dueThresholds({ ...args, war: war({ state: 'preparation' }), fired: new Set(), now: at(10) }), []);
});

test('no alert when everyone attacked', () => {
  const done = war();
  done.clan.members = [{ name: 'A', attacks: [{}, {}] }];
  assert.deepEqual(dueThresholds({ war: done, clanTag: '%23X', thresholds: [30], fired: new Set(), now: Date.parse('2026-11-16T03:59:00Z') }), []);
});

test('embeds build without throwing', () => {
  assert.ok(warStatusEmbed(war()).toJSON().fields.length >= 3);
  assert.ok(warStatsEmbed(war()).toJSON().title.includes('Us'));
  assert.ok(alertEmbed(war(), 30).toJSON().title.includes('30m'));
});

test('config: clan tag normalisation and validation', () => {
  assert.equal(normalizeClanTag('#2pp0'), '%232PP0');
  assert.equal(normalizeClanTag('%232PP0'), '%232PP0');
  assert.equal(normalizeClanTag(''), '');
  assert.throws(() => normalizeClanTag('#NOT*TAG'));
  assert.deepEqual(parseMinutes('30, 720,x,120'), [720, 120, 30]);
  assert.throws(() => load({ POLL_SECONDS: '5' }));
  assert.equal(load({ DISCORD_TOKEN: 't' }).pollSeconds, 180);
});

test('coc client: sends bearer, maps errors, requires config', async () => {
  let seen;
  const ok = async (url, opts) => { seen = { url, opts }; return { ok: true, json: async () => ({ state: 'notInWar' }) }; };
  const c = createClient({ token: 'T', clanTag: '%23ABC', fetchImpl: ok });
  assert.equal((await c.currentWar()).state, 'notInWar');
  assert.ok(seen.url.endsWith('/clans/%23ABC/currentwar'));
  assert.equal(seen.opts.headers.Authorization, 'Bearer T');
  const nf = async () => ({ ok: false, status: 404, text: async () => 'x' });
  await assert.rejects(createClient({ token: 'T', clanTag: '%23ABC', fetchImpl: nf }).currentWar(), { status: 404 });
  await assert.rejects(createClient({ token: '', clanTag: '%23ABC' }).currentWar(), /COC_TOKEN/);
});

test('one command set with permission gates on the dangerous ones', () => {
  assert.deepEqual(definitions.map((d) => d.name), ['ping', 'war', 'lockdown', 'unlock', 'cleanup', 'whoami']);
  for (const n of ['lockdown', 'unlock', 'cleanup', 'whoami']) {
    const d = definitions.find((x) => x.name === n);
    assert.ok(d.default_member_permissions, `${n} must require a permission`);
  }
});
