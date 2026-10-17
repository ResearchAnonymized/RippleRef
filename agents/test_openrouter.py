#!/usr/bin/env python3
"""
Test script to verify OpenRouter API key is working.
Run this to check if your OpenRouter API key is configured correctly.
"""

import os
import sys
import asyncio
import httpx

# SINGLE SOURCE OF TRUTH: Load from agents/.env file ONLY
# This is the ONLY place you need to paste your OpenRouter API key
try:
    from dotenv import load_dotenv
    # Load .env file from the agents directory (where this script is located)
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    # Use override=True to ensure .env values take precedence
    load_dotenv(dotenv_path=env_path, override=True)
    print(f"✅ Loaded .env from: {env_path}")
except ImportError:
    print("⚠️  WARNING: python-dotenv not installed. Install with: pip install python-dotenv")
    print("   Falling back to environment variable...")
    pass

# Load API key - ONLY from .env file (or environment as fallback)
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not OPENROUTER_API_KEY:
    print("=" * 70)
    print("❌ ERROR: OPENROUTER_API_KEY not found!")
    print("=" * 70)
    print()
    print("📍 SINGLE PLACE TO PASTE YOUR KEY:")
    print("   File: agents/.env")
    print("   Full path: " + os.path.join(os.path.dirname(__file__), '.env'))
    print()
    print("📝 Create the file with this content (ONE line only):")
    print("   OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE")
    print()
    print("💡 Quick command:")
    print(f"   echo 'OPENROUTER_API_KEY=sk-or-v1-YOUR-NEW-KEY-HERE' > {os.path.join(os.path.dirname(__file__), '.env')}")
    print()
    sys.exit(1)
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-opus-4.8")

async def test_openrouter():
    """Test OpenRouter API key"""
    print("🔍 Testing OpenRouter API Key...")
    print(f"Model: {MODEL}")
    print(f"URL: {OPENROUTER_URL}")
    print()
    
    if not OPENROUTER_API_KEY:
        print("❌ ERROR: OPENROUTER_API_KEY environment variable is not set!")
        print()
        print("To set it, run:")
        print("  export OPENROUTER_API_KEY='your-key-here'")
        print()
        print("Or create a .env file in the agents/ directory with:")
        print("  OPENROUTER_API_KEY=your-key-here")
        return False
    
    # Mask the key for display
    masked_key = OPENROUTER_API_KEY[:10] + "..." + OPENROUTER_API_KEY[-4:] if len(OPENROUTER_API_KEY) > 14 else "***"
    print(f"✅ API Key found: {masked_key}")
    print()
    
    try:
        print("📡 Making test API call to OpenRouter...")
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": MODEL,
            "messages": [
                {"role": "user", "content": "Say 'OK' if you can read this."}
            ],
            "max_tokens": 10,
        }
        
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(OPENROUTER_URL, headers=headers, json=payload)
            
            if r.status_code == 200:
                data = r.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                print("✅ SUCCESS: OpenRouter API key is working!")
                print(f"   Response: {content.strip()}")
                print(f"   Status Code: {r.status_code}")
                return True
            elif r.status_code == 401:
                print("❌ ERROR: OpenRouter API key is invalid or unauthorized")
                print(f"   Status Code: {r.status_code}")
                print("   This usually means:")
                print("   - The API key is incorrect")
                print("   - The API key has been revoked")
                print("   - The API key doesn't have access to the selected model")
                error_text = r.text
                print(f"   Error details: {error_text[:200]}")
                return False
            else:
                error_text = r.text
                print(f"❌ ERROR: OpenRouter API returned error")
                print(f"   Status Code: {r.status_code}")
                print(f"   Error: {error_text[:500]}")
                return False
                
    except httpx.TimeoutException:
        print("❌ ERROR: Request to OpenRouter timed out")
        print("   This might indicate network issues or OpenRouter is down")
        return False
    except Exception as e:
        print(f"❌ ERROR: {type(e).__name__}: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return False

if __name__ == "__main__":
    success = asyncio.run(test_openrouter())
    sys.exit(0 if success else 1)

