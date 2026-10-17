# 📍 WHERE TO PASTE YOUR OPENROUTER API KEY

## ✅ SINGLE PLACE - NO CONFUSION

**File:** `agents/.env`  
**Full Path:** `agents/.env` (repository root)  
**Line:** Line 1 (or the line that starts with `OPENROUTER_API_KEY=`)

## 📝 EXACT CONTENT

Create or edit `agents/.env` file with this **ONE line**:

```
OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE
```

Replace `sk-or-v1-YOUR-NEW-KEY-HERE` with your actual key from https://openrouter.ai/keys

## 🚀 QUICK SETUP

```bash
cd agents
echo 'OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE' > .env
```

## ✅ THAT'S IT!

- **Only one file:** `agents/.env`
- **Only one line:** `OPENROUTER_API_KEY=...`
- **No other places needed**

The system will automatically load from this file.

## 🧪 TEST IT

```bash
cd agents
python3 test_openrouter.py
```

## 🔒 SECURITY

- This file is in `.gitignore` (won't be committed to git)
- Your key stays local and secure
- Never commit this file!

