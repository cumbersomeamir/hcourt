# Change Tracking System - Architecture & Robustness Analysis

## How It Works

### 1. **Polling Mechanism (Frontend)**
- The frontend polls the `/api/monitor` endpoint every 30 seconds
- Uses JavaScript `setInterval` for periodic checks
- Runs in the browser, so it only works when the page is open

### 2. **Change Detection Flow**

```
Every 30 seconds:
1. Fetch latest HTML from court website
2. Parse HTML to extract court data
3. Fetch most recent schedule from MongoDB
4. Compare old vs new data
5. Detect changes (added/updated/removed/status_changed)
6. Save changes to MongoDB
7. Create notifications
8. Save new schedule snapshot
```

### 3. **Change Detection Algorithm**

The system compares:
- **Court Number** (primary key)
- **Session Status** (in session / not in session)
- **Serial Number**
- **List Type**
- **Progress Status**
- **Case Details** (case number, title, counsels)

**Comparison Logic:**
- Uses `Map` for O(1) lookups by court number
- Compares field-by-field for active cases
- Uses `JSON.stringify` for deep comparison of case details
- Detects 4 types of changes:
  - `added`: New court case appears
  - `updated`: Case details change (serial, list, progress, case info)
  - `removed`: Court case disappears
  - `status_changed`: Session status changes (in session ↔ not in session)

## Robustness Analysis

### ✅ **Strengths**

1. **Persistent Storage**: All changes are saved to MongoDB
   - Never loses change history
   - Can replay/analyze changes later
   - Database acts as source of truth

2. **Complete History**: Every schedule snapshot is saved
   - Can track changes over time
   - Can detect patterns or anomalies
   - Historical data available

3. **Change Type Classification**: Different types of changes are tracked separately
   - Better notification context
   - Easier to filter/analyze

4. **Deep Comparison**: Compares all fields, not just presence
   - Catches subtle changes (e.g., progress updates)
   - More accurate change detection

### ⚠️ **Limitations & Potential Issues**

1. **Frontend-Only Polling**:
   - ❌ Only works when browser tab is open
   - ❌ Stops if user closes tab
   - ❌ Multiple tabs = multiple polling instances (wasteful)
   - ✅ **Solution Needed**: Move to backend cron job or server-side polling

2. **No Error Recovery**:
   - ❌ If one poll fails, next poll continues (no retry logic)
   - ❌ Network errors are logged but not retried
   - ✅ **Solution**: Add retry mechanism with exponential backoff

3. **Race Conditions**:
   - ⚠️ If monitoring runs twice simultaneously, could create duplicate records
   - ⚠️ No locking mechanism
   - ✅ **Solution**: Add distributed lock or unique constraint on timestamp

4. **JSON.stringify Comparison**:
   - ⚠️ Case details comparison uses JSON.stringify
   - ⚠️ Property order matters (though usually stable)
   - ✅ **Better**: Deep equality function (lodash isEqual)

5. **No Deduplication**:
   - ⚠️ If same change happens multiple times, all are recorded
   - ✅ **Acceptable**: Historical record is valuable

6. **Missing Fields in Comparison**:
   - ⚠️ Only compares specific fields
   - ⚠️ If new fields added to parser, comparison won't catch them
   - ✅ **Better**: Compare all fields dynamically

7. **Timestamp Precision**:
   - ⚠️ Multiple changes in same millisecond get same timestamp
   - ✅ **Acceptable**: Very rare scenario

8. **Website Structure Changes**:
   - ❌ If court website HTML changes, parser breaks
   - ❌ No validation/fallback
   - ✅ **Solution**: Add parser validation and error handling

## Recommendations for Improvement

### High Priority:
1. **Backend Cron Job**: Move polling to server-side
   - Use Vercel Cron or external service (cron-job.org)
   - Runs 24/7, not dependent on browser

2. **Error Handling & Retries**:
   - Retry failed requests
   - Exponential backoff
   - Alert on persistent failures

3. **Deduplication**:
   - Check if change already exists before inserting
   - Use unique index on (courtNo, timestamp, changeType)

### Medium Priority:
4. **Better Comparison Logic**:
   - Use deep equality library
   - Compare all fields dynamically

5. **Monitoring & Alerts**:
   - Log monitoring runs
   - Alert if monitoring stops
   - Dashboard for system health

6. **Rate Limiting Protection**:
   - Don't spam court website
   - Respect rate limits

### Low Priority:
7. **Optimization**:
   - Only fetch if last fetch was > 25 seconds ago
   - Cache parsing results
   - Batch database writes

