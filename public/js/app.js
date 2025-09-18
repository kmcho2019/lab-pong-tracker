const overviewGrid = document.getElementById('overview-grid');
const rankingsBody = document.getElementById('rankings-body');
const matchesBody = document.getElementById('matches-body');
const refreshButton = document.getElementById('refresh-button');
const matchForm = document.getElementById('match-form');
const formFeedback = document.getElementById('form-feedback');
const playerSelectOne = document.getElementById('player-one');
const playerSelectTwo = document.getElementById('player-two');
const playerFilter = document.getElementById('match-filter');
const playerDetailsSelect = document.getElementById('player-details');
const rankingsSearch = document.getElementById('rankings-search');
const lastUpdatedLabel = document.getElementById('last-updated');
const playerPanel = document.getElementById('player-panel');
const playerNameEl = document.getElementById('player-name');
const playerRatingEl = document.getElementById('player-rating');
const playerRecordEl = document.getElementById('player-record');
const playerWinPctEl = document.getElementById('player-winpct');
const playerStreakEl = document.getElementById('player-streak');
const playerDiffEl = document.getElementById('player-diff');
const headToHeadBody = document.getElementById('headtohead-body');
const recentBody = document.getElementById('recent-body');
const ratingCanvas = document.getElementById('rating-chart');

const collator = new Intl.Collator(['ko', 'en'], { sensitivity: 'base' });

let leagueState = {
  players: [],
  rankings: [],
  matches: [],
  rawPlayers: []
};

let playersById = new Map();

async function init() {
  await refreshState();
  wireEvents();
}

async function refreshState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) {
      throw new Error('Failed to load league data');
    }
    const data = await response.json();

    leagueState = {
      players: data.computed.players,
      rankings: data.computed.rankings,
      matches: data.computed.matches,
      rawPlayers: data.players
    };

    playersById = new Map([
      ...leagueState.rawPlayers.map((player) => [player.id, player]),
      ...leagueState.players.map((player) => [player.id, player])
    ]);

    renderOverview();
    renderRankings();
    renderMatches();
    renderPlayerOptions();
    updateLastUpdated();
  } catch (error) {
    console.error(error);
    setFeedback(`⚠️ ${error.message}`, true);
  }
}

function renderOverview() {
  const totalPlayers = leagueState.players.length;
  const totalMatches = leagueState.matches.length;
  const topPlayer = leagueState.rankings[0];
  const averageRating = leagueState.players.reduce((sum, player) => sum + player.rating, 0) / (totalPlayers || 1);
  const recentCutoff = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const matchesThisWeek = leagueState.matches.filter((match) => new Date(match.playedAt).getTime() >= recentCutoff).length;

  const tiles = [
    { label: 'Players', value: totalPlayers },
    { label: 'Matches recorded', value: totalMatches },
    { label: 'This week', value: matchesThisWeek },
    { label: 'Average rating', value: Math.round(averageRating) }
  ];

  if (topPlayer) {
    tiles.push({ label: 'Leaderboard leader', value: `${topPlayer.displayName} · ${topPlayer.rating}` });
  }

  overviewGrid.innerHTML = tiles
    .map(
      (tile) => `
        <article class="stat-tile">
          <span>${tile.label}</span>
          <strong>${tile.value}</strong>
        </article>
      `
    )
    .join('');
}

function renderRankings() {
  const query = rankingsSearch.value?.trim().toLowerCase();
  const rows = leagueState.rankings
    .filter((player) => {
      if (!query) return true;
      return player.displayName.toLowerCase().includes(query);
    })
    .map((player, index) => {
      const position = index + 1;
      const record = `${player.wins}-${player.losses}`;
      const streak = formatStreak(player.streak);
      const winPct = `${player.winPct.toFixed(1)}%`;
      return `
        <tr data-player="${player.id}">
          <td>${position}</td>
          <td>${player.displayName}</td>
          <td>${player.rating}</td>
          <td>${record}</td>
          <td>${winPct}</td>
          <td>${streak}</td>
        </tr>
      `;
    })
    .join('');

  rankingsBody.innerHTML = rows || '<tr><td colspan="6">No players yet.</td></tr>';
}

function renderMatches() {
  const filterId = playerFilter.value;
  const rows = leagueState.matches
    .filter((match) => {
      if (!filterId) return true;
      return match.playerOne.id === filterId || match.playerTwo.id === filterId;
    })
    .map((match) => renderMatchRow(match))
    .join('');

  matchesBody.innerHTML = rows || '<tr><td colspan="6">No matches recorded.</td></tr>';
}

function renderMatchRow(match) {
  const dateLabel = formatDate(match.playedAt);
  const { playerOne, playerTwo, winnerId } = match;
  const winnerFirst = winnerId === playerTwo.id;
  const first = winnerFirst ? playerTwo : playerOne;
  const second = winnerFirst ? playerOne : playerTwo;
  const matchup = `${first.displayName} vs ${second.displayName}`;
  const score = winnerFirst
    ? `${playerTwo.score} — ${playerOne.score}`
    : `${playerOne.score} — ${playerTwo.score}`;
  const deltaFirst = winnerFirst ? playerTwo.delta : playerOne.delta;
  const deltaSecond = winnerFirst ? playerOne.delta : playerTwo.delta;
  const deltaText = `${formatDelta(deltaFirst)} / ${formatDelta(deltaSecond)}`;
  const location = match.location || '—';
  const notes = match.notes || '—';

  return `
    <tr>
      <td>${dateLabel}</td>
      <td>${matchup}</td>
      <td>${score}</td>
      <td>${deltaText}</td>
      <td>${location}</td>
      <td>${notes}</td>
    </tr>
  `;
}

function renderPlayerOptions() {
  const players = leagueState.players.slice().sort((a, b) => collator.compare(a.displayName, b.displayName));
  const options = players
    .map((player) => `<option value="${player.id}">${player.displayName}</option>`)
    .join('');
  playerSelectOne.innerHTML = '<option value="">Select player</option>' + options;
  playerSelectTwo.innerHTML = '<option value="">Select player</option>' + options;
  playerFilter.innerHTML = '<option value="">All players</option>' + options;
  playerDetailsSelect.innerHTML = '<option value="">Select a player</option>' + options;
}

function wireEvents() {
  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    await refreshState();
    refreshButton.disabled = false;
  });

  rankingsSearch.addEventListener('input', () => renderRankings());
  playerFilter.addEventListener('change', () => renderMatches());
  playerDetailsSelect.addEventListener('change', (event) => loadPlayerProfile(event.target.value));

  matchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitMatch();
  });
}

async function loadPlayerProfile(playerId) {
  if (!playerId) {
    playerPanel.hidden = true;
    return;
  }

  try {
    const response = await fetch(`/api/players/${playerId}`);
    if (!response.ok) {
      throw new Error('Failed to load profile');
    }
    const { player } = await response.json();

    playerPanel.hidden = false;
    playerNameEl.textContent = player.displayName;
    playerRatingEl.textContent = `${player.rating}`;
    playerRecordEl.textContent = `${player.wins}-${player.losses}`;
    playerWinPctEl.textContent = `${player.winPct.toFixed(1)}%`;
    playerStreakEl.textContent = formatStreak(player.streak);
    playerDiffEl.textContent = player.pointDifferential >= 0 ? `+${player.pointDifferential}` : `${player.pointDifferential}`;

    renderHeadToHead(player.headToHead);
    renderRecent(player.recentMatches);
    drawRatingChart(player.ratingHistory);
  } catch (error) {
    console.error(error);
    setFeedback(`⚠️ ${error.message}`, true);
  }
}

function renderHeadToHead(records = []) {
  if (!records.length) {
    headToHeadBody.innerHTML = '<tr><td colspan="3">No matches yet.</td></tr>';
    return;
  }

  headToHeadBody.innerHTML = records
    .map((record) => {
      const name = record.opponentName || playersById.get(record.opponentId)?.displayName || 'Unknown';
      const ratio = `${record.wins}-${record.losses}`;
      const lastPlayed = record.lastPlayedAt ? formatDate(record.lastPlayedAt) : '—';
      return `
        <tr>
          <td>${name}</td>
          <td>${ratio}</td>
          <td>${lastPlayed}</td>
        </tr>
      `;
    })
    .join('');
}

function renderRecent(matches = []) {
  if (!matches.length) {
    recentBody.innerHTML = '<tr><td colspan="4">No matches yet.</td></tr>';
    return;
  }

  const rows = matches
    .slice(0, 10)
    .map((match) => {
      const date = formatDate(match.playedAt);
      const { playerOne, playerTwo } = match;
      const score = `${playerOne.score} — ${playerTwo.score}`;
      const delta = `${formatDelta(playerOne.delta)} / ${formatDelta(playerTwo.delta)}`;
      return `
        <tr>
          <td>${date}</td>
          <td>${playerOne.displayName} vs ${playerTwo.displayName}</td>
          <td>${score}</td>
          <td>${delta}</td>
        </tr>
      `;
    })
    .join('');

  recentBody.innerHTML = rows;
}

async function submitMatch() {
  const playerOneId = playerSelectOne.value;
  const playerTwoId = playerSelectTwo.value;
  const scoreOne = Number(document.getElementById('score-one').value);
  const scoreTwo = Number(document.getElementById('score-two').value);
  const target = Number(document.getElementById('target').value) || undefined;
  const winBy = Number(document.getElementById('winby').value) || undefined;
  const location = document.getElementById('location').value.trim() || undefined;
  const notes = document.getElementById('notes').value.trim() || undefined;

  if (!playerOneId || !playerTwoId) {
    setFeedback('Select two players.', true);
    return;
  }
  if (playerOneId === playerTwoId) {
    setFeedback('Choose two different players.', true);
    return;
  }

  try {
    setFeedback('Submitting…');
    const response = await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerOneId,
        playerTwoId,
        playerOneScore: scoreOne,
        playerTwoScore: scoreTwo,
        target,
        winBy,
        location,
        notes
      })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || 'Could not submit match');
    }

    matchForm.reset();
    setFeedback('✅ Match recorded!');
    await refreshState();
  } catch (error) {
    console.error(error);
    setFeedback(`⚠️ ${error.message}`, true);
  }
}

function setFeedback(message, isError = false) {
  formFeedback.textContent = message;
  formFeedback.style.color = isError ? '#b42318' : 'var(--muted)';
}

function updateLastUpdated() {
  const now = new Date();
  lastUpdatedLabel.textContent = `Updated ${formatDateTime(now)}`;
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const dt = new Date(isoString);
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(dt);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date instanceof Date ? date : new Date(date));
}

function formatStreak(streak) {
  if (!streak) return '—';
  return streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`;
}

function formatDelta(delta) {
  const value = Number(delta || 0).toFixed(1);
  return Number(delta) >= 0 ? `+${value}` : value;
}

function drawRatingChart(history = []) {
  const ctx = ratingCanvas.getContext('2d');
  ctx.clearRect(0, 0, ratingCanvas.width, ratingCanvas.height);

  if (!history.length) {
    ctx.fillStyle = '#8b95b1';
    ctx.font = '14px sans-serif';
    ctx.fillText('No matches yet', 16, ratingCanvas.height / 2);
    return;
  }

  const padding = 32;
  const width = ratingCanvas.width - padding * 2;
  const height = ratingCanvas.height - padding * 2;

  const ratings = history.map((entry) => entry.rating);
  const minRating = Math.min(...ratings) - 20;
  const maxRating = Math.max(...ratings) + 20;
  const times = history.map((entry) => new Date(entry.playedAt || Date.now()).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times) || Date.now();

  ctx.strokeStyle = 'rgba(33, 68, 148, 0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, padding, width, height);

  ctx.strokeStyle = '#2d6cdf';
  ctx.lineWidth = 2;
  ctx.beginPath();

  history.forEach((entry, index) => {
    const x = padding + normalize(new Date(entry.playedAt || Date.now()).getTime(), minTime, maxTime) * width;
    const y = padding + height - normalize(entry.rating, minRating, maxRating) * height;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = '#2d6cdf';
  history.forEach((entry) => {
    const x = padding + normalize(new Date(entry.playedAt || Date.now()).getTime(), minTime, maxTime) * width;
    const y = padding + height - normalize(entry.rating, minRating, maxRating) * height;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function normalize(value, min, max) {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

init();
