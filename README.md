# Daily Tracker

A personal tracker for your focus time (Cybersecurity, Reading, LeetCode, Projects) and daily checks (Gym, Protein shake).
It has Day, Week, Month and Year views and an Edit tab for changing what you track.

Every tap is saved on your device first, then synced to your own Upstash Redis database through one Vercel function.
That means it keeps working offline and syncs when you're back online. Logging on your phone and your laptop on the same day
merges cleanly, because each day is synced on its own.

## Files

| File | What it is |
|---|---|
| `index.html`, `style.css`, `app.js` | The app (plain HTML/CSS/JS, no build step) |
| `lib/merge.js` | Merges two copies of your data (shared by the browser and the server) |
| `api/data.js` | The Vercel function: `GET`/`PUT /api/data`, protected by your passcode |
| `manifest.webmanifest`, `icon-*.png` | Lets you add it to your phone's home screen as an app |

## Deploy (about 10 minutes)

1. **Put the code on GitHub.** Create a new (private) repo and push this folder to it.
2. **Import it into Vercel.** Go to vercel.com → *Add New → Project*, pick the repo and keep the defaults
   (Framework preset: *Other*, no build command). Click *Deploy*. The first deploy works, but syncing won't yet.
3. **Add the database.** In the project, open the *Storage* tab → *Create / Connect Database* → choose **Upstash for Redis**
   (the free plan is plenty) → connect it to this project for all environments.
   This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars automatically
   (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work).
4. **Set your passcode.** *Settings → Environment Variables* → add `APP_PASSWORD` with a long passphrase
   (for example four random words). This passcode is all that protects your data, so don't reuse one.
5. **Redeploy.** *Deployments* → ⋯ on the latest one → *Redeploy*, so the new env vars are picked up.
6. Open your URL, enter the passcode once per device, and you're in.

**On your phone:** open the URL in Safari → Share → *Add to Home Screen* (on Android in Chrome: ⋮ → *Add to Home screen*).

### With the Vercel CLI instead

```bash
npm i -g vercel
vercel                      # link + first deploy
vercel integration add upstash   # or use the Storage tab
vercel env add APP_PASSWORD
vercel --prod
```

## Good to know

- **Changing the passcode:** change `APP_PASSWORD` in Vercel and redeploy. Each device will ask for the new one.
- **Backups:** Edit → *Download backup*. You can import a backup later; it merges with what's already there and never deletes anything.
- **Timer:** it saves the moment you started, so you can close the app, lock your phone or switch devices, and *Stop* will still log the right time.
- **"Focused time"** is the total of every *Time* activity. *Yes/No* items are counted as days done.
- **Deleting an activity** hides it from the views; its old numbers stay in your backups.
