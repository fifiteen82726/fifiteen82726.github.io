import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const LOCAL_FILE = "worldcup-calendar.html";
const REMOTE_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

function extractConstArray(html, constName) {
  const pattern = new RegExp(`const ${constName} =\\n([\\s\\S]*?)\\n;`);
  const match = html.match(pattern);

  assert(match, `Missing ${constName} in ${LOCAL_FILE}`);
  return JSON.parse(match[1]);
}

function realGroupTeams(matches) {
  return new Set(
    matches
      .filter((match) => match.group)
      .flatMap((match) => [match.team1, match.team2])
  );
}

function parseMatchDateTime(match) {
  const parsed = match.time.match(/^(\d{1,2}):(\d{2}) UTC([+-]\d{1,2})$/);

  assert(parsed, `Match time is not parseable: ${match.date} ${match.time}`);

  const [, hour, minute, offset] = parsed;
  const [year, month, day] = match.date.split("-").map(Number);
  const utcMs = Date.UTC(year, month - 1, day, Number(hour) - Number(offset), Number(minute));

  assert(!Number.isNaN(utcMs), `Match time produced invalid date: ${match.date} ${match.time}`);
  return utcMs;
}

const html = await readFile(LOCAL_FILE, "utf8");
const localMatches = extractConstArray(html, "matches");
const teamsMeta = extractConstArray(html, "teamsMeta");
const response = await fetch(REMOTE_URL);

assert.equal(response.ok, true, `Unable to fetch ${REMOTE_URL}: ${response.status} ${response.statusText}`);

const upstream = await response.json();
const upstreamMatches = upstream.matches;

assert.deepEqual(localMatches, upstreamMatches, "Local matches differ from upstream openfootball 2026/worldcup.json");
assert.equal(localMatches.length, 104, "World Cup 2026 calendar should contain 104 matches");

const upstreamTeams = realGroupTeams(upstreamMatches);
const localTeams = new Set(teamsMeta.map((team) => team.name));

assert.equal(teamsMeta.length, upstreamTeams.size, "teamsMeta should contain exactly one entry per group-stage team");

for (const match of localMatches) {
  parseMatchDateTime(match);
}

for (const team of upstreamTeams) {
  assert(localTeams.has(team), `teamsMeta is missing group-stage team: ${team}`);
}

for (const team of localTeams) {
  assert(upstreamTeams.has(team), `teamsMeta contains stale group-stage team: ${team}`);
}

assert(html.includes('id="timezone"'), "Calendar should include a timezone selector");
assert(html.includes("more-toggle"), "Calendar should render match expansion toggle buttons");
assert(html.includes("expandedDayKeys"), "Calendar should track expanded local-date groups");
assert(html.includes("formatMatchInTimeZone"), "Calendar should format matches in the selected timezone");
assert(html.includes("installCountrySelectTypeahead"), "Country selector should support keyboard typeahead by English country name");
assert(html.includes("data-search-label"), "Country options should expose English search labels for keyboard selection");
assert(!html.includes('${t.flag_icon || "🏳️"} ${t.name}'), "Country option text should not start with flags because native select typeahead matches visible text");

console.log(`worldcup-calendar matches upstream ${upstream.name}: ${localMatches.length} matches, ${teamsMeta.length} teams`);
