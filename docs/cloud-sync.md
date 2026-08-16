# Cloud sync setup

By default Reef Log keeps its data in the browser on each device, so your phone and your
desktop hold separate logs. Connecting a free [Supabase](https://supabase.com) project
puts them on the same data, syncing automatically in the background.

It stays free at this scale — a three-year reef log is a few hundred kilobytes against a
500 MB free tier.

**Your credentials never go in this repository.** You paste them into the app on each
device and they are stored in that browser only. The repository is public; nothing here
contains keys.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Give it a name and a database password (you won't need the password again — save it
   somewhere anyway).
3. Wait a minute or two for it to finish provisioning.

## 2. Create the table

Open **SQL Editor** in the left sidebar, paste all of this in, and press **Run**.

```sql
-- One row per record, scoped to whoever created it.
create table if not exists public.reef_records (
  user_id    uuid        not null default auth.uid()
                         references auth.users on delete cascade,
  collection text        not null,
  record_id  text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, record_id)
);

-- Without this, the anon key would let anyone read the table.
alter table public.reef_records enable row level security;

drop policy if exists "own rows" on public.reef_records;
create policy "own rows" on public.reef_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sync pulls "everything changed since X", so this is the index that matters.
create index if not exists reef_records_user_updated
  on public.reef_records (user_id, updated_at);
```

Row-level security is the part that matters. The key the app uses is meant to be public,
and it is only safe because this policy restricts every row to the account that wrote it.

## 3. Make the sign-in email send a code

Reef Log signs in with a six-digit code rather than a magic link, because a link tapped
in your email app opens the browser rather than the installed app, and the sign-in is
stranded in the wrong place.

Go to **Authentication → Emails** (older projects: **Authentication → Email Templates**),
choose the **Magic Link** template, and replace its body with:

```html
<h2>Reef Log sign-in</h2>
<p>Your code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>It expires in an hour. If you didn't ask for this, ignore this email.</p>
```

The important part is `{{ .Token }}` — that is the six-digit code. Save.

> Supabase's built-in email sender is rate-limited to a handful of messages per hour.
> That is ample for signing in a couple of devices now and then.

## 4. Connect the app

In Supabase, open **Project Settings → API** and copy:

- **Project URL** — looks like `https://abcdefgh.supabase.co`
- **anon public** key — a long string starting `eyJ…`

Take the **anon public** key, *not* the `service_role` key. The service role key bypasses
row-level security entirely and must never go into a browser.

Then in Reef Log: **Settings → Sync across devices**, paste both, press **Connect**.
Enter your email, press **Email me a code**, type the code in, press **Sign in**.

The first sync uploads your whole log. After that it syncs a few seconds after any
change, whenever you reopen the app, and every five minutes while it is open.

## 5. Add your other device

Open Reef Log there, paste the same URL and key, and sign in with the same email. It
pulls the log down and the two stay in step from then on.

---

## How it behaves

**Offline** — everything keeps working. Changes save locally and go up next time there
is a connection; the header icon shows amber meanwhile.

**The same record edited on both devices** — the later edit wins. Reef Log compares the
time each device stamped on the record, not the order they reached the server.

**Deletions** — travel properly. A deleted record is kept as a hidden tombstone so the
other device knows to remove it rather than sending it back.

**What syncs** — tanks, parameters, readings, livestock, expenses, equipment,
supplements, tasks and activities. Per-device preferences (theme, units, currency) stay
local, as does the sync configuration itself.

## Undoing it

**Sign out** stops syncing on that device and forgets the session; the log stays.
**Disconnect** also forgets the project URL and key. Neither deletes anything, locally or
in the cloud. To wipe the cloud copy, run `delete from public.reef_records;` in the SQL
editor, or delete the Supabase project.

## If something goes wrong

The Sync card shows the error. Common ones:

| Message | Cause |
|---|---|
| "does not look like a project URL" | Include `https://` and no trailing path |
| "Invalid API key" | The `service_role` key was pasted, or the key is truncated |
| Code email never arrives | Template missing `{{ .Token }}`, or the hourly send limit was hit |
| "Session expired" | Signed out elsewhere; sign in again |
| 404 on sync | The SQL in step 2 wasn't run, or was run on a different project |
