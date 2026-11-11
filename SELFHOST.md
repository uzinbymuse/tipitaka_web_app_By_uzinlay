# Self-host on Vercel + Turso (free, no server needed)

ဒီ app ကို ကိုယ့်ဘာသာ အခမဲ့ host လုပ်ချင်ရင် Vercel + Turso နဲ့ ရတယ်။ VPS မလိုဘူး။
Fork လုပ်၊ Turso မှာ DB ၄ ခု တင်၊ Vercel မှာ deploy လုပ် — ဒါပဲ။

Live example: https://tipitaka-web-three.vercel.app

## လိုအပ်တာ

- GitHub account (fork အတွက်)
- Turso account (အခမဲ့ — https://turso.tech — DB 100 ခု၊ 5 GB၊ 500M rows read/month)
- Vercel account (အခမဲ့ — https://vercel.com)

## အဆင့် ၁ — Fork လုပ်ပါ

ဒီ repo ကို ကိုယ့် GitHub account ထဲ fork လုပ်ပါ။

## အဆင့် ၂ — Database ဖိုင်တွေ ရယူပါ

| DB | ဖိုင် | အရွယ်အစား | ရနိုင်တဲ့နေရာ |
|---|---|---|---|
| Pali (၁၉၂ အုပ်) | `tipitaka_pali.db` | 639 MB | Drive zip အောက်မှာ |
| Myanmar (၆၀ အုပ်) | `tipitaka_mm.db` | 275 MB | Drive zip အောက်မှာ |
| Nissaya | `nissaya.db` | 236 MB | မပါဘူး — မရှိလဲ app က အလုပ်လုပ်တယ် (Nissaya feature ပဲ ပိတ်သွားမယ်) |
| Sync (bookmark) | `sync.db` | — | မလိုဘူး — အသစ်ဖွင့်ရင် app က သူ့ဘာသာ အလွတ်ဖိုင် ဆောက်ပေးတယ် |

Pali + Myanmar DB တွေကို ဒီ Drive zip ကနေ ယူပါ —
https://drive.google.com/file/d/1WX-09wlmRDma__j4ErLTK8jrSn8a1Fbx/view?usp=drive_link
(zip ထဲမှာ `tipitaka_pali.db` + `tipitaka_mm.db` ပါတယ်။ zip ထဲက app.py အဟောင်းကို မသုံးပါနဲ့ — repo ထဲက app.py က အသစ်ပါ။)

## အဆင့် ၃ — Turso မှာ DB တွေ တင်ပါ

Turso CLI ကို install လုပ်ပြီး login ဝင်ပါ (`turso auth login`)၊ ပြီးရင် DB တွေ ဆောက်ပါ။
WAL-mode ဖြစ်နေတဲ့ ဖိုင်ဆိုရင် အရင် `PRAGMA journal_mode=DELETE;` လုပ်ပြီး တင်ပါ။

```bash
turso db create tipitaka-pali --location aws-ap-south-1 --from-file tipitaka_pali.db
turso db create tipitaka-mm   --location aws-ap-south-1 --from-file tipitaka_mm.db
# ရွေးချယ်စရာ (ရှိရင်):
turso db create tipitaka-nissaya --location aws-ap-south-1 --from-file nissaya.db
turso db create tipitaka-sync    --location aws-ap-south-1 --from-file sync.db
```

Token ထုတ်ပါ — content DB ၃ ခု (pali/mm/nissaya) က **ဖတ်ဖို့သက်သက်** (read-only)၊
sync DB က **ရေးလို့ရတာ** (read-write) ဖြစ်ရမယ်။

```bash
turso db tokens create tipitaka-pali --read-only
turso db tokens create tipitaka-mm --read-only
turso db tokens create tipitaka-nissaya --read-only   # ရှိရင်
turso db tokens create tipitaka-sync                   # read-write (default)
```

DB တစ်ခုချင်းစီရဲ့ URL ကို `turso db show <name>` နဲ့ ကြည့်ပါ —
`libsql://<name>-<org>.aws-ap-south-1.turso.io` ပုံစံ ဖြစ်မယ်။

## အဆင့် ၄ — Vercel မှာ deploy လုပ်ပါ

1. Vercel dashboard → **Add New → Project** → fork လုပ်ထားတဲ့ repo ကို Import လုပ်ပါ။
2. **Environment Variables** မှာ အောက်က ၈ ခု (ရှိတဲ့ DB အလိုက်) ထည့်ပါ။

| Variable | တန်ဖိုး |
|---|---|
| `TURSO_PALI_URL` | `turso db show tipitaka-pali` က URL |
| `TURSO_PALI_TOKEN` | pali read-only token |
| `TURSO_MM_URL` | `turso db show tipitaka-mm` က URL |
| `TURSO_MM_TOKEN` | mm read-only token |
| `TURSO_NISSAYA_URL` | nissaya URL (ရှိရင်) |
| `TURSO_NISSAYA_TOKEN` | nissaya read-only token (ရှိရင်) |
| `TURSO_SYNC_URL` | sync URL (ရှိရင်) |
| `TURSO_SYNC_TOKEN` | sync read-write token (ရှိရင်) |

3. **Deploy** ကို နှိပ်ပါ။ Python 3.12 ကို repo ထဲက `.python-version` က သတ်မှတ်ပေးပြီးသား။
4. Deploy ပြီးရင် `https://<project>.vercel.app/api/health` က `{"ok":true}` ပြရမယ်။

> **သတိ — `vercel.json` မှာ rewrite မထည့်ပါနဲ့။** Vercel က အခု rewritten
> request တွေကို rewritten destination path အတိုင်း route လုပ်တယ် —
> `/(.*)` ကို `/api/index` (သို့မဟုတ် `/api/index.py`) လို့ rewrite လုပ်ထားရင်
> Flask က request တိုင်းကို PATH_INFO=`/api/index` အဖြစ် လက်ခံရပြီး
> route တစ်ခုမှ မကိုက်လို့ **404 ချည်းပဲ ပြန်မယ်** (2026-11-11 မှာ ကိုယ်တိုင်
> ကြုံခဲ့ရတယ်)။ `vercel.json` မှာ `functions` (maxDuration) ပဲ ထားပြီး
> rewrite လုံးဝ မထည့်ပါနဲ့ — Vercel ရဲ့ Flask-framework routing က
> မူလ path အတိုင်း app ဆီ ပို့ပေးတယ်။

URL တစ်ခုခု မထည့်ထားရင် အဲဒီ DB နဲ့ ဆိုင်တဲ့ feature ပဲ ပိတ်သွားမယ် —
ဥပမာ `TURSO_NISSAYA_URL` မရှိရင် Nissaya မရဘူး၊ `TURSO_SYNC_URL` မရှိရင်
bookmark sync မရဘူး (localStorage history ကတော့ ရတယ်)။

## အဆင့် ၅ — Turso DB တွေ အိပ်မသွားအောင် (keep-alive) — အရေးကြီးတယ်

### ဘာလို့ လိုတာလဲ

Turso အခမဲ့ DB တွေက **၁၀ ရက် လုံးလုံး query မရောက်ရင် archive ဖြစ်သွားတယ်**။
Archive ဖြစ်သွားရင် အဲဒီ DB နဲ့ ဆိုင်တဲ့ feature ပျက်မယ် —
စာအုပ်မဖွင့်နိုင်၊ ရှာမရ၊ sync မရ။ Dashboard ကနေ ပြန် restore လုပ်လို့ရတယ်
(သို့မဟုတ် query ပြန်ရောက်တာနဲ့ သူ့ဘာသာ ပြန်နိုးလာတယ်)၊ ဒါပေမယ့် အဲဒီအချိန်အတွင်း
site ပျက်နေမယ်။ ဒါကြောင့် DB တစ်ခုချင်းစီကို ပုံမှန် ထိပေးဖို့ လိုတယ် —
**၁၀ ရက်အတွင်း အနည်းဆုံး တစ်ကြိမ်**၊ လုံခြုံဖို့ ၃ ရက်တစ်ခါ ဒါမှမဟုတ် နေ့တိုင်း။

### ဘာက "ထိတာ" လဲ — ဘာက မထိတာလဲ

- **ထိတယ်:** DB ကို query ရိုက်တာ — စာအုပ်ဖွင့်တာ၊ ရှာတာ၊
  `/api/books`, `/api/mm/books`, `/api/nissaya/available/<book_id>` ခေါ်တာ၊
  `turso db shell <name> "SELECT 1"` လုပ်တာ။
- **မထိဘူး:** homepage (`/`) ဝင်ကြည့်တာ (HTML ပဲ ပြတာ၊ DB မထိဘူး)၊
  `/api/health` ခေါ်တာ (`{"ok":true}` ပဲ ပြန်တာ၊ DB မထိဘူး)။
  ဒါကြောင့် uptime monitor ကို `/` သို့မဟုတ် `/api/health` မှာ ထားရုံနဲ့
  DB archive မကာကွယ်နိုင်ဘူး — DB ထိတဲ့ endpoint ကို စစ်ခိုင်းမှ ရမယ်။

### နည်း A — Turso CLI + cron/scheduler (အခု live site မှာ သုံးနေတဲ့နည်း)

Turso CLI login ဝင်ပြီးသား စက် (VPS, ကိုယ့် PC, CI) ကနေ ၃ ရက်တစ်ခါ
DB ၄ ခု လုံးကို `SELECT 1` ခေါ်ပေးပါ။

```bash
turso db shell tipitaka-pali     "SELECT 1;"
turso db shell tipitaka-mm       "SELECT 1;"
turso db shell tipitaka-nissaya  "SELECT 1;"
turso db shell tipitaka-sync     "SELECT 1;"
```

တစ်ခုချင်းစီက ဂဏန်းတစ်ခု ပြန်ပေးရင် အဲဒီ DB အသက်ရှင်နေတယ်။
cron (Linux `crontab`, systemd timer, ဒါမှမဟုတ် Muse လို agent ရဲ့
scheduled job) နဲ့ ၃ ရက်တစ်ခါ run ပေးပါ။ ပုံမှန်ဆို ဘာမှ မပို့ဘူး —
DB တစ်ခု ပျက်မှပဲ သတိပေးပါ။

Live site (`tipitaka-web-three.vercel.app`) မှာ ဒီနည်းကို သုံးထားတယ် —
cron job `tipitaka-turso-keep-alive`, ၇၂ နာရီတစ်ခါ၊ DB ၄ ခု လုံး ping တယ်။

### နည်း B — Vercel Cron (GitHub+Vercel စနစ်ထဲမှာပဲ၊ VM မလို)

Vercel ရဲ့ Cron Jobs နဲ့ လုပ်လို့ရတယ် — သီးခြား server မလိုဘူး။
အဆင့် ၂ ခု လိုတယ်။

**၁) app ထဲမှာ `/api/keep-alive` endpoint တစ်ခု ထည့်ပါ**
(ခေါ်တိုင်း DB ၄ ခု လုံးကို query ရိုက်ပေးတယ်)။

```python
@app.route("/api/keep-alive")
def keep_alive():
    """Touch each configured Turso DB so the free tier doesn't archive it
    (10-day rule). Called by Vercel Cron once a day."""
    results = {}
    for name, getter in [
        ("pali", get_pali_db),
        ("mm", get_mm_db),
        ("nissaya", get_nissaya_db),
        ("sync", _sync_conn),
    ]:
        if not turso_enabled(name):
            results[name] = "skipped (not configured)"
            continue
        try:
            conn = getter()
            conn.execute("SELECT 1").fetchone()
            results[name] = "ok"
        except Exception as e:
            results[name] = f"error: {e}"
    ok = all(v == "ok" for v in results.values()
             if v != "skipped (not configured)")
    return jsonify({"ok": ok, "databases": results}), (200 if ok else 500)
```

**၂) `vercel.json` ထဲမှာ cron ထည့်ပါ** (deploy လုပ်တာနဲ့ cron စမယ်)။

```json
{
  "functions": { "api/index.py": { "maxDuration": 60 } },
  "crons": [{ "path": "/api/keep-alive", "schedule": "0 2 * * *" }]
}
```

မှတ်ချက် (Vercel Hobby plan ကန့်သတ်ချက်) —
- Cron က **တစ်နေ့ တစ်ကြိမ်ပဲ** ရတယ် (`0 2 * * *` လို daily schedule ပဲ ရ၊
  နာရီတိုင်း/မိနစ်တိုင်း လုပ်လို့မရဘူး — ပိုစိပ်ရင် deploy fail ဖြစ်မယ်)။
  ၁၀ ရက် window အတွက် နေ့တိုင်း ဆို လုံလောက်တယ်။
- အချိန်က **UTC ပဲ** — `0 2 * * *` ဆိုတာ UTC 02:00 (မြန်မာ 08:30)၊
  ပြီးတော့ သတ်မှတ်ထားတဲ့ နာရီအတွင်း ဘယ်အချိန်မှာမဆို run နိုင်တယ်
  (02:00–02:59 ကြား)။
- Production deployment မှာပဲ run တယ်။

ဒီနည်း (B) က repo ထဲမှာ **အခုထိ မထည့်ရသေးဘူး** — မှတ်တမ်းအဖြစ်
ရေးထားတာ။ ပြောင်းသုံးချင်ရင် အပေါ်က endpoint + cron ထည့်ပြီး push လုပ်ပါ၊
ပြီးရင် နည်း A ရဲ့ cron ကို ဖျက်ပါ (နှစ်ခု ထပ်မနေအောင်)။

### နည်း C — UptimeRobot (တစ်စိတ်တစ်ပိုင်းပဲ ရတယ်)

UptimeRobot monitor ကို DB ထိတဲ့ endpoint တွေမှာ ထားရင် DB ကို ထိပေးတယ်
(homepage `/` မှာထားရင် မထိဘူး)။

| DB | Monitor URL |
|---|---|
| Pali | `https://<project>.vercel.app/api/books` |
| Myanmar | `https://<project>.vercel.app/api/mm/books` |
| Nissaya | `https://<project>.vercel.app/api/nissaya/available/<book_id>` |

**Sync DB ကတော့ UptimeRobot နဲ့ မရဘူး** — Sync ကို ထိတဲ့ endpoint တွေက
POST ပဲ (GET မရှိဘူး)၊ UptimeRobot က GET ပဲ ခေါ်လို့ရလို့။
ဒါကြောင့် UptimeRobot ကို keep-alive အဖြစ် သုံးရင် Sync အတွက်
နည်း A ဒါမှမဟုတ် B တစ်ခု လိုသေးတယ်။

### နည်း D — GitHub Actions (scheduled workflow)

`.github/workflows/keep-alive.yml` မှာ schedule ထည့်ပြီး
Turso CLI ဒါမှမဟုတ် `curl` နဲ့ DB တွေ ping လို့ရတယ်။
ဒါပေမယ့် သတိထားစရာ ၂ ခု ရှိတယ် —
GitHub က repo မှာ **၆၀ ရက် လှုပ်ရှားမှု မရှိရင်** scheduled workflow ကို
auto-disable လုပ်ပစ်တယ် (push/PR မရှိရင် ရပ်သွားမယ်)၊
ပြီးတော့ Turso token တွေကို GitHub Secrets အဖြစ် ထပ်ထည့်ရမယ်။
ဒါကြောင့် နည်း A ဒါမှမဟုတ် B ကို ပိုအကြံပြုတယ်။

## မှတ်စုများ

- **သူငယ်ချင်းကို share ချင်ရင်** သူ့ကို ကိုယ့် Turso token ပေးတာထက်
  ဒီ guide အတိုင်း သူ့ဘာသာ self-host ခိုင်းတာက ပိုကောင်းတယ် —
  ကိုယ့် token ပေးရင် သူဖတ်တိုင်း ကိုယ့် 500M rows/month quota ထဲက ကုန်မယ်။
- **Local / VPS မှာ run ချင်ရင်** `TURSO_*` variable တွေ မထည့်ပဲ
  DB ဖိုင်တွေကို repo folder ထဲ ထည့်ပြီး ပုံမှန် Flask app အတိုင်း run လို့ရတယ် —
  local mode က အရင်အတိုင်းပဲ အလုပ်လုပ်တယ်။
- **Export (docx)** က Vercel ရဲ့ 4.5 MB response cap အောက်မှာ ရှိရမယ် —
  စာအုပ်ကြီး အပြည့်အစုံ export လုပ်ရင် cap ကျော်နိုင်တယ်။
- **Search** က Turso မှာ server-side run တယ် — မြန်မာစာပိုဒ်ရှာတာ အပါအဝင် အကုန် ရတယ်။
