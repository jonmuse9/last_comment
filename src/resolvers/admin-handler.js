import Resolver from "@forge/resolver";
import api, { storage, route } from "@forge/api";
import cache from "@forge/cache";
import { Queue } from "@forge/events";

// Import split modules
import {
  getSyncState,
  setSyncState,
  appendSyncLog,
  acquireLock,
  releaseLock,
  fetchIssues,
  isAnySyncRunning,
} from "./sync-helpers.js";
import {
  syncQueueConsumer,
  enqueueSyncBatches,
  forceStopAllSyncs,
} from "./sync-logic.js";
import { getAppSettings, saveAppSettings } from "./settings.js";
import { handleCommentEvent } from "./comment-event.js";

// Create a new resolver instance
const resolver = new Resolver();

// --- SYNC LOGIC ---

// Get sync status
resolver.define("getSyncStatus", async () => getSyncState());

// Queue consumer resolver - structured according to Forge documentation
resolver.define("event-listener", async ({ payload, context }) => {
  try {
    const result = await syncQueueConsumer({ payload, context });
    return result;
  } catch (error) {
    console.error("[event-listener] Error processing event:", error);
    throw error;
  }
});

// Stop sync
resolver.define("stopSync", async () => {
  let state = await getSyncState();
  state.isRunning = false;
  await setSyncState(state);
  await releaseLock();
  await appendSyncLog({ type: "stopped" }, state.projectId, state.projectKey);
  return state;
});

// Expose sync log (from cache)
resolver.define("getSyncLog", async () => {
  const cacheClient = cache.connect();
  const cacheKey = "syncLog";
  let log = [];
  const cached = await cacheClient.get(cacheKey);
  if (cached) {
    try {
      log = JSON.parse(cached);
    } catch (e) {
      log = [];
    }
  }
  return log;
});

// --- TEMPORARY: Force reset sync state and lock ---
resolver.define("forceResetSync", async () => {
  await releaseLock();
  await setSyncState({
    isRunning: false,
    startTime: null,
    totalIssues: 0,
    processedIssues: 0,
    currentBatchStart: 0,
    errors: [],
    lastUpdated: Date.now(),
    batchSize: 50,
  });
  // Clear sync log in cache
  const cacheClient = cache.connect();
  await cacheClient.set("syncLog", JSON.stringify([]));
  return { ok: true };
});

// Get app settings
resolver.define("getAppSettings", async (req) => {
  let { projectId, projectKey } = req.payload || {};
  if (projectKey && !projectId) {
    try {
      const response = await api
        .asApp()
        .requestJira(route`/rest/api/3/project/${projectKey}`);
      if (response.ok) {
        const project = await response.json();
        projectId = project.id;
      }
    } catch (error) {}
  }
  return await getAppSettings(projectId);
});

// Save app settings
resolver.define("saveAppSettings", async (req) => {
  return await saveAppSettings(req.payload);
});

// Start sync
resolver.define("startSync", async ({ payload }) => {
  const { projectId, projectKey, batchSize, jqlQuery, appSettings } = payload;
  if (!(await acquireLock())) throw new Error("Sync already running");
  let state = await getSyncState();
  if (state.isRunning) throw new Error("Sync already running");

  // For global admin sync, require JQL query
  if (!projectId && !projectKey && (!jqlQuery || !jqlQuery.trim())) {
    throw new Error("JQL query is required for global sync");
  }

  // Get total issues
  const data = await fetchIssues(
    0,
    5000,
    projectId,
    projectKey,
    "",
    true,
    "key",
    jqlQuery
  );
  const total = data.total ?? data.count ?? 0;
  // If there are 0 issues, immediately stop sync and log
  if (total === 0) {
    state = {
      isRunning: false,
      startTime: Date.now(),
      totalIssues: 0,
      processedIssues: 0,
      currentBatchStart: 0,
      errors: [],
      lastUpdated: Date.now(),
      batchSize: batchSize || 50,
      projectId,
      projectKey,
      jqlQuery,
    };
    await setSyncState(state);
    await appendSyncLog({ type: "start", total }, projectId, projectKey);
    await appendSyncLog({ type: "completed", total }, projectId, projectKey);
    await releaseLock();
    return state;
  }
  // Set state to running, then enqueue batches
  state = {
    isRunning: true,
    startTime: Date.now(),
    totalIssues: total,
    processedIssues: 0,
    currentBatchStart: 0,
    errors: [],
    lastUpdated: Date.now(),
    batchSize: batchSize || 50,
    projectId,
    projectKey,
    jqlQuery,
  };
  await setSyncState(state);
  await appendSyncLog({ type: "start", total }, projectId, projectKey);
  // Enqueue batches immediately after starting sync
  await enqueueSyncBatches({
    totalIssues: total,
    batchSize: batchSize || 50,
    projectId,
    projectKey,
    jqlQuery,
    appSettings: appSettings || {},
  });
  return state;
});

// Force stop all syncs (emergency function)
resolver.define("forceStopAllSyncs", async () => {
  try {
    return await forceStopAllSyncs();
  } catch (error) {
    console.error("[resolver:forceStopAllSyncs] Error:", error);
    throw error;
  }
});

// Re-export the trigger-compatible calculateFieldValue for event-handler.js
export { handleCommentEvent };

// Export isAnySyncRunning for external checks
export { isAnySyncRunning };

// Export resolver
export const adminHandler = resolver.getDefinitions();
