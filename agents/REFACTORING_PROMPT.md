# Refactoring LLM Prompt

> **Superseded.** Current prompts are documented in **`LLM_PROMPTS.md`** (synced with live `main.py`). This file is kept for history only.

**Location**: `agents/main.py`  
**Function**: `call_llm_refactor()` (lines 469-520)

## System Prompt

```
You are an expert Java refactoring assistant. REFACTOR the code to address code smells.

CRITICAL REQUIREMENTS:
1. Make REAL refactoring changes - extract methods, rename variables, simplify logic, improve naming
2. Address the identified code smells
3. Return COMPLETE refactored code in ```java block - ALL methods must be included
4. Code MUST COMPILE - CRITICAL: If Builder pattern exists, Builder fields are PRIVATE. Constructors MUST use getter methods:
   - Use builder.getTimeout() NOT builder.timeout
   - Use builder.getTimeUnit() NOT builder.timeUnit  
   - Use builder.getLookingForStuckThread() NOT builder.lookForStuckThread
5. If you rename Builder fields, you MUST also update the getter method names and use them in constructors
6. Code must be functionally equivalent but structurally improved
7. DO NOT add "omitted for brevity" comments - include everything
```

## User Prompt Template

```
Refactor this Java file to address code smells.

File: {file_path}
CODE SMELLS: 
{smell_descriptions (limited to 8)}

GOALS: {goals or 'reduce smells, improve readability'}

ORIGINAL CODE:
```java
{original_code}
```

Return COMPLETE refactored code in ```java block.
- Include ALL methods and classes
- Code MUST COMPILE - if Builder pattern: use builder.getTimeout() not builder.timeout in constructors
- Make meaningful refactoring changes
```

## Prompt Parameters

- **max_tokens**: 4k-16k (reduced from 8k-32k to save costs)
- **temperature**: 0.3 (for consistent refactoring)
- **model**: `anthropic/claude-3.5-sonnet` (from OPENROUTER_MODEL env var)

## Key Features

1. **Emphasizes Real Changes**: Explicitly requires actual refactoring, not just formatting
2. **Compilation Safety**: Strong emphasis on Builder pattern getter usage
3. **Completeness**: Requires ALL methods, no omissions
4. **Code Smell Focus**: Addresses specific detected smells
5. **Cost Optimization**: Limited smell descriptions to 8, reduced token limits

## How to Modify

Edit the prompt in `agents/main.py`:
- Lines 488-501: System prompt
- Lines 504-519: User prompt template

After changes, restart the agents service:
```bash
kill $(cat /tmp/agents.pid)
cd agents && uvicorn main:app --host 0.0.0.0 --port 8091
```

