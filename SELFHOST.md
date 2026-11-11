# Self-host on Vercel + Turso (free, no server needed)

ဒီ app ကို ကိုယ့်ဘာသာ အခမဲ့ host လုပ်ချင်ရင် Vercel + Turso နဲ့ ရတယ်။ VPS မလိုဘူး။
Fork လုပ်၊ Turso မှာ DB ၄ ခု တင်၊ Vercel မှာ deploy လုပ် — ဒါပဲ။

Live example: https://tipitaka-web.vercel.app

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

URL တစ်ခုခု မထည့်ထားရင် အဲဒီ DB နဲ့ ဆိုင်တဲ့ feature ပဲ ပိတ်သွားမယ် —
ဥပမာ `TURSO_NISSAYA_URL` မရှိရင် Nissaya မရဘူး၊ `TURSO_SYNC_URL` မရှိရင်
bookmark sync မရဘူး (localStorage history ကတော့ ရတယ်)။

## အဆင့် ၅ — Turso DB တွေ အိပ်မသွားအောင် (keep-alive)

Turso အခမဲ့ DB တွေက **၁၀ ရက် မသုံးရင် archive ဖြစ်သွားတယ်**။
ဒါကို ကာကွယ်ဖို့ တစ်ပတ်တစ်ခါ (သို့မဟုတ် ရက်အနည်းငယ်တစ်ခါ) DB တစ်ခုချင်းစီကို
`SELECT 1` လောက် ခေါ်ပေးပါ — ဥပမာ cron/scheduled job နဲ့
`turso db shell <name> "SELECT 1"` လုပ်ပေးရင် ရတယ်။
Site ကို ပုံမှန်ဝင်ဖတ်နေရင်လည်း အလိုအလို active ဖြစ်နေမယ်။

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
