# E2E Tests for Themis Job Board

## Running the Tests

1. Start the development server:
   ```bash
   npm run dev
   ```

2. In another terminal, run the E2E test:
   ```bash
   npx tsx e2e-tests/job-workflow.test.ts
   ```

## Job Workflow Test

The `job-workflow.test.ts` tests the complete job posting and proposal flow:

1. **Create Job** - Posts a new job with requirements and budget
2. **Submit Proposal** - Provider submits a bid on the job
3. **Accept Proposal** - Job poster accepts the provider's proposal
4. **Link Escrow** - Links an on-chain escrow to the job
5. **Verify Status** - Confirms the job is in "funded" status

## Test Accounts

The test uses mock private keys (hardcoded for testing only):
- **Poster**: `0x0123...0123`
- **Provider**: `0x1234...1234`

**⚠️ NEVER use these keys in production!**

## Expected Output

```
============================================================
Starting E2E Job Workflow Test
============================================================

[1/5] Creating job...
✓ Job created: job-1234567890-abc123

[2/5] Submitting proposal...
✓ Proposal submitted: p-1234567890-def456

[3/5] Accepting proposal...
✓ Proposal accepted

[4/5] Linking escrow to job...
✓ Escrow linked

[5/5] Verifying final job status...
✓ Job verified successfully

============================================================
✅ E2E Job Workflow Test PASSED!
============================================================

Job ID: job-1234567890-abc123
Proposal ID: p-1234567890-def456
Escrow ID: 999
Status: funded
```
