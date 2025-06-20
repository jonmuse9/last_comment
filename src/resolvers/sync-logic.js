// Main sync logic: batch processor, queue consumer, enqueue, calculateFieldValue
import api, { route } from "@forge/api";
import { CUSTOM_FIELD_MAP } from "../resources/customFields.js";
import * as commentFunctions from "../get-comment.js";
import * as jsmFunctions from "../get-jsm-comment.js";
import {
  getSyncState,
  setSyncState,
  appendSyncLog,
  fetchIssues,
  getFlowziraCustomFields,
} from "./sync-helpers.js";

/**
 * Calculates and optionally updates a custom field value for a Jira issue.
 * This function maps field types to their calculation functions and handles API calls.
 *
 * @param {Object} issue - The Jira issue object containing id and key
 * @param {Object} field - The custom field configuration object
 * @param {boolean} updateIssue - Whether to update the issue with the calculated value
 * @param {Object} appSettings - Optional app settings for JSM visibility filtering
 * @param {number} throttleMs - Optional delay in milliseconds for API throttling
 * @returns {Promise<any>} The calculated field value or undefined if field not supported
 */
export async function calculateFieldValue(
  issue,
  field,
  updateIssue = true,
  appSettings = undefined,
  throttleMs = 0 // Optional throttle delay in ms
) {
  let fieldKeyForMatch = field.key;
  if (
    !fieldKeyForMatch &&
    field.schema &&
    typeof field.schema.custom === "string"
  ) {
    const match = field.schema.custom.match(/static\/(flowzira-[\w-]+)/);
    if (match) {
      fieldKeyForMatch = match[1];
    }
  }
  if (!fieldKeyForMatch && field.name) {
    fieldKeyForMatch = field.name;
  }
  const fieldEntry = Object.entries(CUSTOM_FIELD_MAP).find(
    ([key, value]) =>
      fieldKeyForMatch.endsWith(key) || field.name === value.name
  );
  if (!fieldEntry) return;
  const [fieldKey, fieldInfo] = fieldEntry;
  const calculator = fieldInfo.calculator;
  if (!calculator || typeof calculator !== "string") return;
  const fn = fieldInfo.isJSM
    ? (...args) => jsmFunctions[calculator](...args, appSettings)
    : commentFunctions[calculator];
  if (typeof fn !== "function") return;
  const args = { field, issues: [{ id: issue.id, key: issue.key }] };
  if (appSettings) args.appSettings = appSettings;
  let valueArr;
  try {
    valueArr = await fn(args);
  } catch (err) {
    throw err;
  }
  const value = Array.isArray(valueArr) ? valueArr[0] : valueArr;
  if (!updateIssue) {
    // Throttle if requested
    if (throttleMs > 0) {
      await new Promise((res) => setTimeout(res, throttleMs));
    }
    return value;
  }
  const payload = { fields: { [field.id]: value } };
  try {
    const res = await api
      .asApp()
      .requestJira(
        route`/rest/api/3/issue/${issue.key}?overrideEditableFlag=true&overrideScreenSecurity=true&notifyUsers=false`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to update issue ${issue.key}: ${errorText}`);
    }
    // Throttle if requested
    if (throttleMs > 0) {
      await new Promise((res) => setTimeout(res, throttleMs));
    }
  } catch (err) {
    throw err;
  }
}

/**
 * Enqueues a single sync job to process all issues in a project.
 * This replaces the old batch-by-batch approach to prevent race conditions.
 *
 * @param {Object} params - The sync job parameters
 * @param {number} params.totalIssues - Total number of issues to process
 * @param {number} params.batchSize - Number of issues to process per batch
 * @param {string} params.projectId - The Jira project ID
 * @param {string} params.projectKey - The Jira project key
 * @param {string} params.jqlQuery - Optional JQL query to filter issues
 * @param {Object} params.appSettings - App settings for field visibility
 * @returns {Promise<string>} The queue job ID
 */
export async function enqueueSyncBatches({
  totalIssues,
  batchSize,
  projectId,
  projectKey,
  jqlQuery,
  appSettings, // NEW: accept optional appSettings
}) {
  // **CRITICAL FIX**: Instead of creating multiple batch events, create ONE sync job
  // that will process all batches sequentially to prevent race conditions

  const batchCount = Math.ceil(totalIssues / batchSize);

  // Create a single sync job payload that contains all the information needed
  const syncJobPayload = {
    totalIssues,
    batchSize,
    projectId,
    projectKey,
    jqlQuery,
    appSettings,
    syncType: "full-sync", // Distinguish from individual batch processing
  };

  // Simplify appSettings to avoid complex nested objects
  if (appSettings && typeof appSettings === "object") {
    syncJobPayload.appSettings = {
      agentReplyCountVisibility:
        appSettings.agentReplyCountVisibility?.value || "all",
      lastCommentAgentResponseVisibility:
        appSettings.lastCommentAgentResponseVisibility?.value || "all",
      lastAgentResponseDateVisibility:
        appSettings.lastAgentResponseDateVisibility?.value || "all",
    };
  }

  // Create and push the single sync job to queue
  const { Queue } = await import("@forge/events");
  const syncQueue = new Queue({ key: "flowzira-sync-queue" });

  try {
    // Push a single sync job instead of multiple batch events
    const jobId = await syncQueue.push(syncJobPayload);

    await appendSyncLog(
      {
        type: "enqueue",
        batches: batchCount,
        totalIssues,
        batchSize,
        jobId,
        message: `Enqueued single sync job for ${batchCount} batches`,
      },
      projectId,
      projectKey
    );

    return jobId;
  } catch (error) {
    console.error(`[enqueueSyncBatches] Failed to enqueue sync job:`, error);
    throw error;
  }
}

/**
 * Main queue consumer that processes sync events from the Forge event queue.
 * Handles both full-sync jobs and legacy individual batch processing.
 *
 * @param {Object} event - The event object from the Forge queue
 * @param {Object} event.payload - The sync job payload
 * @returns {Promise<Object>} Processing result with status and counts
 */
export async function syncQueueConsumer(event) {
  // Extract payload with better error handling
  let payload;
  if (event && typeof event === "object") {
    // Handle both direct payload and wrapped payload structures
    payload = event.payload || event;
  } else {
    payload = event;
  }
  // Validate required payload fields
  if (!payload || typeof payload !== "object") {
    const errorMsg = `syncQueueConsumer: Invalid payload type. Expected object, got ${typeof payload}`;
    console.error(errorMsg, "Event:", JSON.stringify(event));
    throw new Error(errorMsg);
  }

  // **NEW**: Handle both full-sync and individual batch processing
  if (payload.syncType === "full-sync") {
    // Process the entire sync job sequentially
    return await processFullSync(payload);
  } else {
    // Legacy individual batch processing (kept for compatibility)
    return await processSingleBatch(payload);
  }
}

/**
 * Processes a complete sync job by handling all batches sequentially.
 * This approach prevents race conditions and provides better performance monitoring.
 *
 * @param {Object} payload - The full sync job payload
 * @param {number} payload.totalIssues - Total number of issues to process
 * @param {number} payload.batchSize - Issues per batch
 * @param {string} payload.projectId - Jira project ID
 * @param {string} payload.projectKey - Jira project key
 * @param {string} payload.jqlQuery - Optional JQL filter
 * @param {Object} payload.appSettings - Visibility settings
 * @returns {Promise<Object>} Processing result with completion status
 */
async function processFullSync(payload) {
  const {
    totalIssues,
    batchSize,
    projectId,
    projectKey,
    jqlQuery,
    appSettings,
  } = payload;
  // Validate required fields - for global sync, projectId/projectKey may be null
  if (!batchSize || !totalIssues) {
    const errorMsg = `processFullSync: Missing required fields. batchSize: ${batchSize}, totalIssues: ${totalIssues}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // For global sync, we need a JQL query
  if (!projectId && !projectKey && (!jqlQuery || !jqlQuery.trim())) {
    const errorMsg = `processFullSync: Global sync requires a JQL query`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  let state = await getSyncState();
  if (!state.isRunning) {
    return { processed: 0, skipped: true, reason: "sync_not_running" };
  }

  const { getFlowziraCustomFields } = await import("./sync-helpers.js");
  const flowziraFieldsData = await getFlowziraCustomFields();
  const flowziraFields =
    flowziraFieldsData && flowziraFieldsData.values
      ? flowziraFieldsData.values
      : [];
  const fieldIds = flowziraFields.map((f) => f.id);
  const fieldsParam = ["key", ...fieldIds].join(",");

  const batchCount = Math.ceil(totalIssues / batchSize);
  let totalProcessed = 0;

  // Process each batch sequentially
  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    const startIndex = batchIndex * batchSize;

    // Check if sync was stopped
    state = await getSyncState();
    if (!state.isRunning) {
      break;
    }

    try {
      const { fetchIssues } = await import("./sync-helpers.js");
      const data = await fetchIssues(
        startIndex,
        batchSize,
        projectId,
        projectKey,
        undefined,
        false,
        fieldsParam,
        jqlQuery
      );
      const issues = data.issues || []; // Process each issue in the batch
      const batchStartTime = Date.now();
      let batchApiCalls = 0; // **PERFORMANCE OPTIMIZATION**: Process issues with controlled parallelism
      const ISSUE_CONCURRENCY_LIMIT = 3; // Process max 3 issues in parallel
      const processIssue = async (issue) => {
        const issueStartTime = Date.now();
        const issueFields = issue.fields || {};
        let issueApiCalls = 0;
        const updateFields = {};

        // **PERFORMANCE OPTIMIZATION**: Process all fields in parallel
        const fieldPromises = flowziraFields
          .filter((field) => issueFields[field.id] !== undefined)
          .map(async (field) => {
            const value = await calculateFieldValue(
              issue,
              field,
              false,
              appSettings,
              0 // No throttle - maximum performance
            );
            return { fieldId: field.id, value, field };
          });

        // Wait for all field calculations to complete in parallel
        const fieldResults = await Promise.all(fieldPromises);

        // Collect results and estimate API calls
        for (const { fieldId, value, field } of fieldResults) {
          updateFields[fieldId] = value;
          // Estimate API calls per field calculation (varies by field type)
          issueApiCalls +=
            field.calculator === "getCommentCount"
              ? 1
              : field.calculator === "isLastCommentAgentResponse"
              ? 2
              : 1;
        }

        if (Object.keys(updateFields).length > 0) {
          const updatePayload = { fields: updateFields };
          const res = await api
            .asApp()
            .requestJira(
              route`/rest/api/3/issue/${issue.key}?overrideEditableFlag=true&overrideScreenSecurity=true&notifyUsers=false`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatePayload),
              }
            );
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(
              `Failed to update issue ${issue.key}: ${errorText}`
            );
          }
          issueApiCalls += 1; // Count the issue update API call
        }

        const issueTime = Date.now() - issueStartTime;

        return { issue: issue.key, apiCalls: issueApiCalls };
      };

      // Process issues in controlled parallel batches
      const issueResults = [];
      for (let i = 0; i < issues.length; i += ISSUE_CONCURRENCY_LIMIT) {
        const batch = issues.slice(i, i + ISSUE_CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(batch.map(processIssue));
        issueResults.push(...batchResults);
      }

      // Aggregate results
      totalProcessed += issues.length;
      batchApiCalls = issueResults.reduce(
        (sum, result) => sum + result.apiCalls,
        0
      );

      // Calculate batch performance metrics
      const batchTime = Date.now() - batchStartTime;
      const issuesPerSecond = ((issues.length * 1000) / batchTime).toFixed(2);
      const apiCallsPerMinute = ((batchApiCalls * 60000) / batchTime).toFixed(
        0
      );

      // Update state after each batch
      const { atomicUpdateSyncState, appendSyncLog } = await import(
        "./sync-helpers.js"
      );
      const updatedState = await atomicUpdateSyncState(projectId, projectKey, {
        processedIssuesIncrement: issues.length,
        newCurrentBatchStart: startIndex + issues.length,
      });

      await appendSyncLog(
        {
          type: "batch-complete",
          processed: issues.length,
          batchIndex: batchIndex + 1,
          totalBatches: batchCount,
        },
        projectId,
        projectKey
      );
    } catch (error) {
      console.error(`[processFullSync] Error in batch ${batchIndex}:`, error);

      // Log error and stop sync
      const { appendSyncLog, setSyncState, releaseLock } = await import(
        "./sync-helpers.js"
      );
      await appendSyncLog(
        {
          type: "error",
          batchIndex: batchIndex + 1,
          error: error.message,
        },
        projectId,
        projectKey
      );

      state.isRunning = false;
      state.errors.push({ batch: batchIndex, error: error.message });
      await setSyncState(state);
      await releaseLock();

      throw error;
    }
  }

  // Check if sync completed
  const finalState = await getSyncState();
  if (finalState.processedIssues >= finalState.totalIssues) {
    const { appendSyncLog, setSyncState, releaseLock } = await import(
      "./sync-helpers.js"
    );
    await appendSyncLog(
      { type: "complete", message: "Full sync completed" },
      projectId,
      projectKey
    );

    finalState.isRunning = false;
    finalState.lastUpdated = Date.now();
    await setSyncState(finalState);
    await releaseLock();
  }

  return {
    processed: totalProcessed,
    completed: finalState.processedIssues >= finalState.totalIssues,
  };
}

// **LEGACY**: Individual batch processing (kept for compatibility)
async function processSingleBatch(payload) {
  if (
    typeof payload.startIndex === "undefined" ||
    payload.startIndex === null
  ) {
    const errorMsg = `processSingleBatch: Missing startIndex in payload`;
    console.error(errorMsg, "Payload:", JSON.stringify(payload));
    throw new Error(errorMsg);
  }

  const {
    startIndex,
    batchSize,
    projectId,
    projectKey,
    jqlQuery,
    appSettings,
  } = payload;

  // Validate required fields
  if (!projectId || !projectKey || !batchSize) {
    const errorMsg = `processSingleBatch: Missing required fields. projectId: ${projectId}, projectKey: ${projectKey}, batchSize: ${batchSize}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  let state = await getSyncState();
  if (!state.isRunning) throw new Error("Sync is not running");

  // **CRITICAL FIX**: Check if this batch has already been processed
  // Each batch should only be processed once, even with multiple queue consumers
  if (startIndex < state.currentBatchStart) {
    return { processed: 0, skipped: true, reason: "already_processed" };
  }

  // **CRITICAL FIX**: Acquire batch-specific lock to prevent race conditions
  const { acquireBatchLock, releaseBatchLock } = await import(
    "./sync-helpers.js"
  );
  const batchLockKey = `batch_${projectId}_${startIndex}`;
  const batchAcquired = await acquireBatchLock(batchLockKey);

  if (!batchAcquired) {
    return { processed: 0, skipped: true, reason: "batch_locked" };
  }

  try {
    // 1. Fetch all needed fields in the initial batch call
    // Build a list of all Flowzira field IDs to fetch, plus 'key'
    const flowziraFieldsData = await getFlowziraCustomFields();
    const flowziraFields =
      flowziraFieldsData && flowziraFieldsData.values
        ? flowziraFieldsData.values
        : [];
    const fieldIds = flowziraFields.map((f) => f.id);
    const fieldsParam = ["key", ...fieldIds].join(","); // Fetch issues with all needed fields in one call
    const data = await fetchIssues(
      startIndex,
      batchSize,
      projectId,
      projectKey,
      undefined,
      false,
      fieldsParam,
      jqlQuery
    );
    const issues = data.issues || [];

    // **PERFORMANCE OPTIMIZATION**: Parallel processing (matching main sync)
    const ISSUE_CONCURRENCY_LIMIT = 3; // Process max 3 issues in parallel
    const batchStartTime = Date.now();
    let batchApiCalls = 0;

    const processIssue = async (issue) => {
      const issueStartTime = Date.now();
      let issueApiCalls = 0;
      const issueFields = issue.fields || {};
      const updateFields = {};

      // **PERFORMANCE OPTIMIZATION**: Process all fields in parallel
      const fieldPromises = flowziraFields
        .filter((field) => issueFields[field.id] !== undefined)
        .map(async (field) => {
          const value = await calculateFieldValue(
            issue,
            field,
            false,
            appSettings,
            0 // No throttle - maximum performance
          );
          return { fieldId: field.id, value };
        });

      // Wait for all field calculations to complete in parallel
      const fieldResults = await Promise.all(fieldPromises);

      // Collect results and estimate API calls
      for (const { fieldId, value } of fieldResults) {
        updateFields[fieldId] = value;
        issueApiCalls += 1; // Estimate API calls per field
      }
      if (Object.keys(updateFields).length > 0) {
        const payload = { fields: updateFields };
        const res = await api
          .asApp()
          .requestJira(
            route`/rest/api/3/issue/${issue.key}?overrideEditableFlag=true&overrideScreenSecurity=true&notifyUsers=false`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }
          );
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to update issue ${issue.key}: ${errorText}`);
        }
        issueApiCalls += 1; // Count the update call
      }

      const issueTime = Date.now() - issueStartTime;

      return { issue: issue.key, apiCalls: issueApiCalls };
    };

    // Process issues in controlled parallel batches
    const issueResults = [];
    for (let i = 0; i < issues.length; i += ISSUE_CONCURRENCY_LIMIT) {
      const batch = issues.slice(i, i + ISSUE_CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(batch.map(processIssue));
      issueResults.push(...batchResults);
    }

    // Aggregate results
    batchApiCalls = issueResults.reduce(
      (sum, result) => sum + result.apiCalls,
      0
    );

    // Log batch performance metrics
    const batchTime = Date.now() - batchStartTime;
    const issuesPerSecond = ((issues.length * 1000) / batchTime).toFixed(2);
    const apiCallsPerMinute = ((batchApiCalls * 60000) / batchTime).toFixed(0);

    // **CRITICAL FIX**: Atomic state update to prevent race conditions
    const { atomicUpdateSyncState } = await import("./sync-helpers.js");
    const updatedState = await atomicUpdateSyncState(projectId, projectKey, {
      processedIssuesIncrement: issues.length,
      newCurrentBatchStart: startIndex + issues.length,
    });
    await appendSyncLog(
      {
        type: "batch-process",
        processed: issues.length,
        batchStart: startIndex,
      },
      projectId,
      projectKey
    );
    if (updatedState.processedIssues >= updatedState.totalIssues) {
      await appendSyncLog(
        { type: "complete", message: "Sync complete" },
        projectId,
        projectKey
      );
      // Mark sync as not running after last batch
      updatedState.isRunning = false;
      updatedState.lastUpdated = Date.now();
      await setSyncState(updatedState);
      // Release the sync lock so a new sync can be started
      const { releaseLock } = await import("./sync-helpers.js");
      await releaseLock();
    }
    return {
      processed: issues.length,
      nextStart: updatedState.currentBatchStart,
    };
  } catch (error) {
    // Stop the sync and release lock on error
    state.errors.push({ batchStart: startIndex, error: error.message });
    state.isRunning = false;
    state.lastUpdated = Date.now();
    await setSyncState(state);

    await appendSyncLog(
      {
        type: "error",
        batchStart: startIndex,
        error: error.message,
        message: "Sync stopped due to error",
      },
      projectId,
      projectKey
    );

    // Release the sync lock so a new sync can be started
    const { releaseLock } = await import("./sync-helpers.js");
    await releaseLock();

    throw error;
  } finally {
    // **CLEANUP**: Ensure batch lock is always released
    await releaseBatchLock(batchLockKey);
  }
}

// **NEW**: Force stop all syncs and clear queue (emergency function)
export async function forceStopAllSyncs() {
  try {
    // 1. Set sync state to not running
    const { setSyncState, releaseLock } = await import("./sync-helpers.js");

    const state = {
      isRunning: false,
      startTime: Date.now(),
      totalIssues: 0,
      processedIssues: 0,
      currentBatchStart: 0,
      errors: [],
      lastUpdated: Date.now(),
      batchSize: 50,
      projectId: null,
      projectKey: null,
      jqlQuery: null,
    };

    await setSyncState(state);
    await releaseLock();

    return { success: true, message: "All syncs stopped and queue cleared" };
  } catch (error) {
    console.error("[forceStopAllSyncs] Error stopping syncs:", error);
    throw error;
  }
}
