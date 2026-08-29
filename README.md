# EARN888

Mobile-friendly Asian-handicap prediction game for the Premier League, for
เอิน, เสียง, guru neung, and arm — same players and match-week system as
[Premier Predictor](../premier-predictor), but with Thai-style handicap
betting instead of win/draw/loss picks.

## Rules

- Every match week, each player gets a fresh **20,000 THB** credit (resets
  weekly — a bad week doesn't carry over).
- Bet on as many or as few matches as you like — no requirement to cover
  every match in the week.
- Minimum bet per match you DO bet on: **1,000 THB**. You don't have to
  spend the full 20,000 — the total just can't exceed your credit for the
  week.
- Bets settle using standard Asian handicap rules: full win, push (stake
  returned), half-win/half-loss (for quarter lines like -0.25/-0.75), or full
  loss — payout uses the decimal odds shown when you placed the bet.
- **Season ranking** = sum of each week's net profit/loss across all weeks
  (not raw balance, since credit resets weekly).

## Data sources

- **Fixtures & results**: ESPN's public soccer scoreboard API (no key
  needed) — same source and match-week logic as Premier Predictor.
- **Handicap odds**: [The Odds API](https://the-odds-api.com), keyed via
  `ODDS_API_KEY` in `app.js` (free tier, 500 requests/month). Bookmakers
  typically don't publish EPL handicap lines more than a few days before
  kickoff, so a match week far in the future may show "ยังไม่มีราคาต่อรอง"
  (no odds yet) for some or all matches — that's expected, just check back
  closer to matchday. The odds shown come from whichever bookmaker The Odds
  API lists first for that match (varies match to match).

## Verify codes (same as Premier Predictor)

- เอิน: `EARN717`
- เสียง: `TEE69`
- guru neung: `1111`
- arm: `arsenal`
- Admin: `Admin1234`

Asked once per submit — cached for the rest of that browser session.

## Admin

The "แอดมิน" tab lets the admin, gated by the admin code on every save:
- Override a user's credit for a specific match week
- Update a user's verify code
- Add a new user
- Delete a user (blocked if only one user is left; reassigns the active
  player if you delete whoever's currently selected)

## Syncing across phones

Shared data (users, bets, results, credit) lives in the same Firestore
project as Premier Predictor, under a different document
(`premierPredictor/earn888State`) so every phone sees the same data live —
same setup, same trust model (open read/write rules, fine for a casual
friend game, not for anything sensitive).

## Running it locally

```powershell
powershell -ExecutionPolicy Bypass -File earn888\serve.ps1
```
then open `http://localhost:5174`.
