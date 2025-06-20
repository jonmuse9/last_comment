// Helper functions for sync logic
import api, { storage, route } from "@forge/api";
import cache from "@forge/cache";

const SYNC_STATE_KEY = "syncState";
const DEFAULT_BATCH_SIZE = 50;
const SYNC_LOG_KEY = "syncLog";
const SYNC_LOCK_KEY = "syncLock";
const STALE_SYNC_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function isSyncStale(state, thresholdMs = STALE_SYNC_TIMEOUT_MS) {
  if (!state || !state.isRunning || !state.lastUpdated) return false;
  return Date.now() - state.lastUpdated > thresholdMs;
}

export async function getSyncState() {
  let state = await storage.get(SYNC_STATE_KEY);
  if (state && state.isRunning && isSyncStale(state)) {
    state = {
      ...state,
      isRunning: false,
      startTime: null,
      processedWorkItems: 0,
      currentBatchStart: 0,
      errors: [],
      lastUpdated: Date.now(),
    };
    await storage.set(SYNC_STATE_KEY, state);
  }
  return (
    state || {
      isRunning: false,
      startTime: null,
      totalWorkItems: 0,
      processedWorkItems: 0,
      currentBatchStart: 0,
      errors: [],
      lastUpdated: null,
      batchSize: DEFAULT_BATCH_SIZE,
    }
  );
}

export async function setSyncState(state) {
  state.lastUpdated = Date.now();
  await storage.set(SYNC_STATE_KEY, state);
}

export async function appendSyncLog(entry, projectId, projectKey) {
  const cacheClient = cache.connect();
  const cacheKey = SYNC_LOG_KEY;
  let log = [];
  const cached = await cacheClient.get(cacheKey);
  if (cached) {
    try {
      log = JSON.parse(cached);
    } catch (e) {
      log = [];
    }
  }
  log.unshift({ ...entry, timestamp: Date.now(), projectId, projectKey });
  await cacheClient.set(cacheKey, JSON.stringify(log.slice(0, 100)), {
    ttlSeconds: 3600, // 1 hour - maximum allowed
  });
}

export async function acquireLock() {
  const cacheClient = cache.connect();
  const lock = await cacheClient.get(SYNC_LOCK_KEY);
  if (lock) {
    try {
      const parsed = typeof lock === "string" ? JSON.parse(lock) : lock;
      if (parsed && parsed.isLocked) return false;
    } catch {}
  }
  await cacheClient.set(
    SYNC_LOCK_KEY,
    JSON.stringify({ isLocked: true, timestamp: Date.now() }),
    { ttlSeconds: 3600 }
  );
  return true;
}

export async function releaseLock() {
  const cacheClient = cache.connect();
  await cacheClient.set(
    SYNC_LOCK_KEY,
    JSON.stringify({ isLocked: false, timestamp: Date.now() }),
    { ttlSeconds: 3600 }
  );
}

// **NEW**: Batch-level locking to prevent duplicate processing
export async function acquireBatchLock(batchKey, ttlSeconds = 600) {
  const cacheClient = cache.connect();
  const fullKey = `batchLock_${batchKey}`;
  try {
    const existing = await cacheClient.get(fullKey);
    if (existing) {
      return false;
    }

    await cacheClient.set(
      fullKey,
      JSON.stringify({ locked: true, timestamp: Date.now() }),
      { ttlSeconds }
    );

    return true;
  } catch (error) {
    console.error(
      `[acquireBatchLock] Error acquiring lock for ${batchKey}:`,
      error
    );
    return false;
  }
}

export async function releaseBatchLock(batchKey) {
  const cacheClient = cache.connect();
  const fullKey = `batchLock_${batchKey}`;

  try {
    await cacheClient.delete(fullKey);
  } catch (error) {
    console.error(
      `[releaseBatchLock] Error releasing lock for ${batchKey}:`,
      error
    );
  }
}

/**
 * Atomically updates sync state to prevent race conditions during concurrent batch processing.
 * Uses a cache-based locking mechanism with retry logic to ensure state consistency.
 *
 * @param {string} projectId - The Jira project ID
 * @param {string} projectKey - The Jira project key
 * @param {Object} updates - State updates to apply
 * @param {number} updates.processedWorkItemsIncrement - Number of work items to add to processed count
 * @param {number} updates.newCurrentBatchStart - New batch start index (only updates if greater)
 * @returns {Promise<Object>} The updated sync state
 */
export async function atomicUpdateSyncState(projectId, projectKey, updates) {
  const lockKey = `state_update_${projectId}`;
  const cacheClient = cache.connect();

  // Try to acquire update lock with retry
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      const existing = await cacheClient.get(lockKey);
      if (!existing) {
        // Acquire the lock
        await cacheClient.set(lockKey, "locked", { ttlSeconds: 30 });
        break;
      }

      // Wait and retry
      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 100)
      );
      attempts++;
    } catch (error) {
      console.error(
        `[atomicUpdateSyncState] Lock attempt ${attempts} failed:`,
        error
      );
      attempts++;
    }
  }

  if (attempts >= maxAttempts) {
    console.warn(
      `[atomicUpdateSyncState] Could not acquire lock after ${maxAttempts} attempts, proceeding anyway`
    );
  }

  try {
    // Get current state
    const state = await getSyncState(); // Apply updates atomically
    if (updates.processedWorkItemsIncrement) {
      state.processedWorkItems += updates.processedWorkItemsIncrement;
    }
    if (updates.newCurrentBatchStart !== undefined) {
      // Only update if the new batch start is greater (prevents regression)
      if (updates.newCurrentBatchStart > state.currentBatchStart) {
        state.currentBatchStart = updates.newCurrentBatchStart;
      }
    }

    // Save updated state
    await setSyncState(state);

    return state;
  } finally {
    // Release the lock
    try {
      await cacheClient.delete(lockKey);
    } catch (error) {
      console.error(
        `[atomicUpdateSyncState] Error releasing update lock:`,
        error
      );
    }
  }
}

export async function getProjectKey(projectId, issueKey) {
  if (issueKey && typeof issueKey === "string") {
    const match = issueKey.match(/^([A-Z][A-Z0-9]+)-\d+$/i);
    if (match) {
      return match[1];
    }
    throw new Error(`Invalid issueKey format: ${issueKey}`);
  }
  if (!projectId)
    throw new Error("No projectId or issueKey provided to getProjectKey");
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/project/${projectId}`);
  if (!response.ok)
    throw new Error(`Failed to fetch project key for ID ${projectId}`);
  const data = await response.json();
  if (!data.key) throw new Error(`No project key found for ID ${projectId}`);
  return data.key;
}

export async function fetchIssues(
  startAt,
  maxResults,
  projectId,
  projectKey,
  issueKey,
  countOnly = false,
  fieldsParam = "key",
  customJqlQuery = null
) {
  let key = projectKey;
  if (!key && (projectId || issueKey)) {
    if (issueKey) {
      key = await getProjectKey(undefined, issueKey);
    } else if (projectId) {
      key = await getProjectKey(projectId);
    }
  }

  // Use custom JQL query if provided, otherwise default to project-based query
  let jql;
  if (customJqlQuery && customJqlQuery.trim()) {
    // If custom JQL is provided, use it directly for global queries or enhance for project queries
    const trimmedJql = customJqlQuery.trim();

    if (!key) {
      // Global query - use JQL as-is but ensure proper ordering
      const hasOrderBy = /\border\s+by\b/i.test(trimmedJql);
      jql = hasOrderBy ? trimmedJql : `${trimmedJql} ORDER BY key DESC`;
    } else {
      // Project-specific query - check if custom JQL already includes project filter
      const hasProjectFilter = /\bproject\s*[=!]\s*/.test(
        trimmedJql.toLowerCase()
      );

      if (hasProjectFilter) {
        // Use the custom JQL as-is but ensure it has ordering
        const hasOrderBy = /\border\s+by\b/i.test(trimmedJql);
        jql = hasOrderBy ? trimmedJql : `${trimmedJql} ORDER BY key DESC`;
      } else {
        // Add project filter to the custom JQL
        const hasOrderBy = /\border\s+by\b/i.test(trimmedJql);
        const baseQuery = `project = "${key}" AND (${trimmedJql})`;
        jql = hasOrderBy ? baseQuery : `${baseQuery} ORDER BY key DESC`;
      }
    }
  } else {
    // Default project query (requires project key)
    if (!key) {
      throw new Error("Project key is required when no JQL query is provided");
    }
    jql = `project = "${key}" ORDER BY key DESC`;
  }

  let url;
  let response;

  if (countOnly) {
    // When only count is needed, use the approximate count endpoint
    url = route`/rest/api/3/search/approximate-count`;
    response = await api.asApp().requestJira(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jql }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    // Return count in the expected format - approximate count endpoint returns { count: number }
    return { count: json.count, total: json.count };
  } else {
    // When actual issues are needed, use the search endpoint
    url = route`/rest/api/3/search/jql?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&fields=${fieldsParam}`;
    response = await api.asApp().requestJira(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    return json;
  }
}

export async function getFlowziraCustomFields(forceRefresh = false) {
  const cacheClient = cache.connect();
  const cacheKey = "flowzira_custom_fields";
  if (!forceRefresh) {
    const cached = await cacheClient.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
  }
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/field/search?type=custom&query=flowzira`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Flowzira custom fields: ${errorText}`);
  }
  const data = await response.json();
  await cacheClient.set(cacheKey, JSON.stringify(data), { ttlSeconds: 3600 });
  return data;
}

export async function isAnySyncRunning() {
  const state = await storage.get(SYNC_STATE_KEY);
  return state && state.isRunning;
}
