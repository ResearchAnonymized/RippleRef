# EMSE Excel Export Plan — B0 / MA / Model-wise Split

**Agreed structure (2026-07-05):** Separate workbooks for B0 and MA, with **one sheet per LLM** inside each, plus a cross-arm analysis file.

---

## Four workbooks

| File | Purpose | Primary audience |
|------|---------|------------------|
| `EMSE_B0_MASTER_DATA.xlsx` | Single-prompt baseline only | RQ2, B0-V1 ablation |
| `EMSE_MA_MASTER_DATA.xlsx` | Multi-agent P-MA only | MA arm description |
| `EMSE_ANALYSIS_RQ3_RQ5_DATA.xlsx` | Paired + cross-model analysis | RQ3, RQ4, RQ5 |
| `EMSE_RIPPLE_MASTER_DATA.xlsx` | Combined index (all RQs in one place) | Quick overview |

**Output:** `~/Desktop/ESE/` (via `bash scripts/export-emse-ripple-master-excel.sh`)

---

## Workbook 1 — `EMSE_B0_MASTER_DATA.xlsx`

| Sheet | Rows (approx) | Content |
|-------|---------------|---------|
| `1_Selected_Systems` | 15 | Repositories (shared) |
| `2_Selected_Files` | 150 | Locked cohort (shared) |
| `3_RQ1_Raw_Exposure` | 150 | Pre-refactor metrics (RQ1) |
| `B0_00_Master_All` | 1,500 | All B0 V1+V2 candidates |
| `B0_01_V2_All_RQ2` | 750 | **RQ2 primary** — dependency-aware single-prompt |
| `B0_02_V1_Ablatio` | 750 | V1 ablation (file-only prompt) |
| `B0_V2_Model_Claude_Opus_4_8` | 150 | V2 × Claude only |
| `B0_V2_Model_GPT_5_5` | 150 | V2 × GPT-5.5 only |
| `B0_V2_Model_Gemini_3_1_Pro` | 150 | V2 × Gemini only |
| `B0_V2_Model_DeepSeek_V4_Pro` | 150 | V2 × DeepSeek only |
| `B0_V2_Model_Qwen_3_6_Plus` | 150 | V2 × Qwen only |
| `B0_V1_Model_*` (×5) | 150 each | V1 per model |
| `B0_L5_Skip_Detail` | ~561 | L5 skipped B0 rows |
| `B0_Summary` | notes | Sheet index + denominators |

---

## Workbook 2 — `EMSE_MA_MASTER_DATA.xlsx`

| Sheet | Rows (approx) | Content |
|-------|---------------|---------|
| `1_Selected_Systems` | 15 | Shared |
| `2_Selected_Files` | 150 | Shared |
| `3_RQ1_Raw_Exposure` | 150 | Shared |
| `MA_00_Master_All` | 750 | All P-MA candidates |
| `MA_Model_Claude_Opus_4_8` | 150 | MA × Claude |
| `MA_Model_GPT_5_5` | 150 | MA × GPT-5.5 |
| `MA_Model_Gemini_3_1_Pro` | 150 | MA × Gemini |
| `MA_Model_DeepSeek_V4_Pro` | 150 | MA × DeepSeek |
| `MA_Model_Qwen_3_6_Plus` | 150 | MA × Qwen |
| `MA_L5_Skip_Detail` | ~355 | L5 skipped MA rows |
| `MA_Summary` | notes | Sheet index |

---

## Workbook 3 — `EMSE_ANALYSIS_RQ3_RQ5_DATA.xlsx`

| Sheet | Content |
|-------|---------|
| `RQ3_Paired_All` | 750 rows — MA joined to B0-V2 (`paired_complete` flag) |
| `RQ3_Paired_Claude_Opus_4_8` | 150 paired (file×model) |
| `RQ3_Paired_GPT_5_5` | 150 |
| `RQ3_Paired_Gemini_3_1_Pro` | 150 |
| `RQ3_Paired_DeepSeek_V4_Pro` | 150 |
| `RQ3_Paired_Qwen_3_6_Plus` | 150 |
| `RQ4_By_Model` | B0-V2 + MA completed — model comparison |
| `RQ5_Factors` | File strata + outcomes for regression |
| `Cross_Arm_Summary` | Paired n, attrition counts |
| `Analysis_Summary` | Notes |

**RQ3 analysis:** Filter `paired_complete = 1` (n ≈ 594). Per-model sheets ≈ 119 paired each (594/5).

---

## Workbook 4 — `EMSE_RIPPLE_MASTER_DATA.xlsx` (index)

Combined RQ1–RQ5 sheets + pointer to the three specialized files above.

---

## Five models (locked)

1. `anthropic/claude-opus-4.8`
2. `openai/gpt-5.5`
3. `google/gemini-3.1-pro-preview`
4. `deepseek/deepseek-v4-pro`
5. `qwen/qwen-3.6-plus`

---

## Regenerate

```bash
bash scripts/export-emse-ripple-master-excel.sh
```

Copies all `EMSE_*.xlsx` to `~/Desktop/ESE/`.

---

## RQ → file mapping

| RQ | Primary file | Sheet |
|----|--------------|-------|
| RQ1 | B0 or MA | `3_RQ1_Raw_Exposure` |
| RQ2 | B0 | `B0_01_V2_All_RQ2` or `B0_V2_Model_*` |
| RQ3 | Analysis | `RQ3_Paired_All` or `RQ3_Paired_*` |
| RQ4 | Analysis | `RQ4_By_Model` |
| RQ5 | Analysis | `RQ5_Factors` |
