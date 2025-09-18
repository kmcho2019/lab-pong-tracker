import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { readFile, writeFile, access, constants } from 'fs/promises';
import { computeLeague } from './rating.js';
import { isValidScore, slugify } from './util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let stateCache = null;
let lastComputed = 0;

async function ensureDataFiles() {
  await ensureFile(PLAYERS_FILE, '[]');
  await ensureFile(MATCHES_FILE, '[]');
}

async function ensureFile(filePath, defaultContent) {
  try {
    await access(filePath, constants.F_OK);
  } catch (error) {
    await writeFile(filePath, defaultContent, 'utf-8');
  }
}

async function readJson(filePath) {
  const data = await readFile(filePath, 'utf-8');
  return JSON.parse(data || '[]');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

async function loadState(force = false) {
  if (!force && stateCache && Date.now() - lastComputed < 1000) {
    return stateCache;
  }
  const [players, matches] = await Promise.all([readJson(PLAYERS_FILE), readJson(MATCHES_FILE)]);
  stateCache = {
    players,
    matches,
    computed: computeLeague(players, matches)
  };
  lastComputed = Date.now();
  return stateCache;
}

async function saveMatch(match) {
  const matches = await readJson(MATCHES_FILE);
  matches.push(match);
  await writeJson(MATCHES_FILE, matches);
  await loadState(true);
}

async function savePlayer(player) {
  const players = await readJson(PLAYERS_FILE);
  players.push(player);
  await writeJson(PLAYERS_FILE, players);
  await loadState(true);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const parsed = raw ? JSON.parse(raw) : {};
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function mapPlayerProfile(playerStat, matches) {
  return {
    id: playerStat.id,
    displayName: playerStat.displayName,
    username: playerStat.username,
    rating: playerStat.rating,
    wins: playerStat.wins,
    losses: playerStat.losses,
    winPct: playerStat.winPct,
    streak: playerStat.streak,
    longestWinStreak: playerStat.longestWinStreak,
    longestLossStreak: playerStat.longestLossStreak,
    lastPlayedAt: playerStat.lastPlayedAt,
    ratingHistory: playerStat.ratingHistory,
    headToHead: playerStat.headToHead,
    pointDifferential: playerStat.pointDifferential,
    recentMatches: matches.filter((match) => match.playerOne.id === playerStat.id || match.playerTwo.id === playerStat.id)
  };
}

const server = http.createServer(async (req, res) => {
  try {
    await ensureDataFiles();
    const baseUrl = `http://${req.headers.host}`;
    const requestUrl = new URL(req.url, baseUrl);
    const { pathname, searchParams } = requestUrl;

    if (pathname.startsWith('/api')) {
      if (req.method === 'GET' && pathname === '/api/state') {
        const league = await loadState();
        return sendJson(res, 200, league);
      }

      if (req.method === 'GET' && pathname === '/api/rankings') {
        const league = await loadState();
        return sendJson(res, 200, { rankings: league.computed.rankings });
      }

      if (req.method === 'GET' && pathname === '/api/matches') {
        const league = await loadState();
        let matches = league.computed.matches;
        const playerId = searchParams.get('playerId');
        if (playerId) {
          matches = matches.filter((match) => match.playerOne.id === playerId || match.playerTwo.id === playerId);
        }
        return sendJson(res, 200, { matches });
      }

      if (req.method === 'GET' && pathname === '/api/players') {
        const league = await loadState();
        return sendJson(res, 200, { players: league.computed.players });
      }

      if (req.method === 'GET' && pathname.startsWith('/api/players/')) {
        const league = await loadState();
        const [, , , playerId] = pathname.split('/');
        const playerStat = league.computed.players.find((p) => p.id === playerId || p.username === playerId);
        if (!playerStat) {
          return sendJson(res, 404, { error: 'Player not found' });
        }
        const profile = mapPlayerProfile(playerStat, league.computed.matches);
        return sendJson(res, 200, { player: profile });
      }

      if (req.method === 'POST' && pathname === '/api/players') {
        const payload = await parseBody(req);
        const { displayName, handedness } = payload;
        if (!displayName) {
          return sendJson(res, 400, { error: 'displayName is required' });
        }
        const username = slugify(displayName) || `player-${Date.now()}`;
        const newPlayer = {
          id: randomUUID(),
          displayName,
          username,
          handedness: handedness ?? null,
          joinedAt: new Date().toISOString()
        };
        await savePlayer(newPlayer);
        return sendJson(res, 201, { player: newPlayer });
      }

      if (req.method === 'POST' && pathname === '/api/matches') {
        const payload = await parseBody(req);
        const { playerOneId, playerTwoId, playerOneScore, playerTwoScore, playedAt, submittedBy, location, notes, target, winBy } = payload;

        if (!playerOneId || !playerTwoId) {
          return sendJson(res, 400, { error: 'playerOneId and playerTwoId are required' });
        }
        if (playerOneId === playerTwoId) {
          return sendJson(res, 400, { error: 'Players must be different' });
        }

        const scoreA = Number(playerOneScore);
        const scoreB = Number(playerTwoScore);
        const targetScore = Number(target) || 11;
        const winByMargin = Number(winBy) || 2;

        if (!isValidScore(scoreA, scoreB, targetScore, winByMargin)) {
          return sendJson(res, 400, { error: 'Scores are not valid for the configured target/winBy' });
        }

        const league = await loadState();
        const players = league.players || [];
        if (!players.find((p) => p.id === playerOneId) || !players.find((p) => p.id === playerTwoId)) {
          return sendJson(res, 400, { error: 'Both players must exist' });
        }

        const match = {
          id: randomUUID(),
          playerOneId,
          playerTwoId,
          playerOneScore: scoreA,
          playerTwoScore: scoreB,
          playedAt: playedAt ? new Date(playedAt).toISOString() : new Date().toISOString(),
          submittedBy: submittedBy ?? null,
          location: location ?? null,
          notes: notes ?? null,
          target: targetScore,
          winBy: winByMargin
        };

        await saveMatch(match);
        return sendJson(res, 201, { match });
      }

      return sendJson(res, 404, { error: 'Not found' });
    }

    // Static assets
    const filePath = resolveStaticPath(pathname);
    try {
      const file = await readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600'
      });
      res.end(file);
    } catch (error) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
    }
  } catch (error) {
    console.error('Request error', error);
    sendJson(res, 500, { error: 'Internal server error', details: error.message });
  }
});

function resolveStaticPath(requestPath) {
  if (requestPath === '/' || requestPath === '') {
    return path.join(PUBLIC_DIR, 'index.html');
  }
  const cleanPath = requestPath.replace(/\.\.+/g, '').replace(/\%(2e|5c)/gi, '');
  return path.join(PUBLIC_DIR, cleanPath);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Lab Pong Tracker listening on http://localhost:${PORT}`);
});
