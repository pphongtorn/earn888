# EARN888

Mobile-friendly Asian-handicap prediction game for the Premier League, for
เอิน, เสียง, guru neung, and arm — same players and match-week system as
[Premier Predictor](../premier-predictor), but with Thai-style handicap
betting instead of win/draw/loss picks.

## Rules

- Every match week, each player gets a fresh **20,000 THB** credit (resets
  weekly — a bad week doesn't carry over).
- Every match with odds available must be bet on before submitting.
- Minimum bet per match: **1,000 THB**. You don't have to spend the full
  20,000 — just each individual bet must clear the minimum, and the total
  can't exceed your credit for the week.
- Bets settle using standard Asian handicap rules: full win, push (stake
  returned), half-win/half-loss (for quarter lines like -0.25/-0.75), or full
  loss — payout uses the decimal odds shown when you placed the bet.
- **Season ranking** = sum of each week's net profit/loss across all weeks
  (not raw balance, since credit resets weekly).

## Data sources

- **Fixtures & results**: ESPN's public soccer scoreboard API (no key
  needed) — same source and match-week logic as Premier Predictor.
- **Handicap odds**: [The Odds API](https://the-odds-api.com) — **requires a
  free API key**. Sign up with just an email (no card), copy your key from
  the dashboard, and paste it into the `ODDS_API_KEY` constant near the top
  of `app.js`. Until that's set, fixtures still load fine but odds/betting
  won't be available (the app shows a clear message instead of failing).
  Note: bookmakers typically don't publish EPL handicap lines more than a
  few days before kickoff, so a match week far in the future may show "no
  odds yet" even once the key is set — that's expected, just check back
  closer to matchday.

## Verify codes (same as Premier Predictor)

- เอิน: `EARN717`
- เสียง: `TEE69`
- guru neung: `1111`
- arm: `arsenal`
- Admin: `Admin1234`

Asked once per submit — cached for the rest of that browser session.

## Admin

The "แอดมิน" tab lets the admin override a user's credit for a specific
match week (e.g. to correct a mistake or adjust standings) — gated by the
admin code on every save.

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
