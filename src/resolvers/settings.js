// Settings logic for app settings
import api, { storage, route } from "@forge/api";
import cache from "@forge/cache";

const DEFAULT_BATCH_SIZE = 50;

export const getAppSettings = async (projectId) => {
  try {
    const cacheClient = cache.connect();
    const cacheKey = projectId ? `appSettings_id_${projectId}` : "appSettings";
    let settings = null;
    const cached = await cacheClient.get(cacheKey);
    if (cached) {
      try {
        settings = JSON.parse(cached);
      } catch (e) {
        // Failed to parse cached settings
      }
    }
    if (!settings) {
      let storageKey = cacheKey;
      try {
        settings = await storage.get(storageKey);
      } catch (storageError) {
        if (
          storageError &&
          storageError.message &&
          storageError.message.includes("rate limited")
        ) {
          throw new Error(
            "The app is being rate limited by Atlassian. Please try again later."
          );
        } else {
          throw storageError;
        }
      }
      if (!settings && projectId) {
        try {
          const projectResponse = await api
            .asApp()
            .requestJira(route`/rest/api/3/project/${projectId}`);
          if (projectResponse.ok) {
            const projectData = await projectResponse.json();
            const projectKey = projectData.key;
            if (projectKey) {
              const oldFormatKey = `appSettings_${projectKey}`;
              const oldSettings = await storage.get(oldFormatKey);
              if (oldSettings) {
                await storage.set(storageKey, oldSettings);
                settings = oldSettings;
              }
            }
          }
        } catch (error) {
          // Error fetching project for migration
        }
      }
      if (settings) {
        await cacheClient.set(cacheKey, JSON.stringify(settings), {
          ttlSeconds: 3600,
        });
      }
    }
    // Use full object defaults
    const defaultOption = { label: "All comments", value: "all" };
    const defaultSettings = {
      agentReplyCountVisibility: defaultOption,
      lastCommentAgentResponseVisibility: defaultOption,
      lastAgentResponseDateVisibility: defaultOption,
    };
    const result = settings || defaultSettings;
    return result;
  } catch (error) {
    const defaultOption = { label: "All comments", value: "all" };
    return {
      agentReplyCountVisibility: defaultOption,
      lastCommentAgentResponseVisibility: defaultOption,
      lastAgentResponseDateVisibility: defaultOption,
    };
  }
};

// Defensive normalization for all fields to always store {label, value} objects
const VISIBILITY_OPTIONS = [
  { label: "All comments", value: "all" },
  { label: "Public comments only", value: "public" },
  { label: "Internal comments only", value: "internal" },
];
function findOptionByValue(val) {
  return (
    VISIBILITY_OPTIONS.find((opt) => opt.value === val) || {
      label: val,
      value: val,
    }
  );
}

export async function saveAppSettings({ payload, projectId, projectKey }) {
  let resolvedProjectId = projectId;
  if (!resolvedProjectId && projectKey) {
    try {
      const response = await api
        .asApp()
        .requestJira(route`/rest/api/3/project/${projectKey}`);
      if (response.ok) {
        const project = await response.json();
        resolvedProjectId = project.id;
      }
    } catch (error) {}
  }
  if (
    !payload ||
    !payload.agentReplyCountVisibility ||
    !payload.lastCommentAgentResponseVisibility ||
    !payload.lastAgentResponseDateVisibility
  ) {
    throw new Error(
      "Invalid settings payload - missing required visibility settings"
    );
  }
  const storageKey = resolvedProjectId
    ? `appSettings_id_${resolvedProjectId}`
    : "appSettings";

  // Load existing settings for merge
  let existingSettings = (await storage.get(storageKey)) || {};
  // Defensive: ensure all fields are objects
  if (typeof existingSettings.agentReplyCountVisibility === "string") {
    existingSettings.agentReplyCountVisibility = findOptionByValue(
      existingSettings.agentReplyCountVisibility
    );
  }
  if (typeof existingSettings.lastCommentAgentResponseVisibility === "string") {
    existingSettings.lastCommentAgentResponseVisibility = findOptionByValue(
      existingSettings.lastCommentAgentResponseVisibility
    );
  }
  if (typeof existingSettings.lastAgentResponseDateVisibility === "string") {
    existingSettings.lastAgentResponseDateVisibility = findOptionByValue(
      existingSettings.lastAgentResponseDateVisibility
    );
  }

  // Merge: use payload if present, else existing
  const newSettings = {
    agentReplyCountVisibility:
      payload.agentReplyCountVisibility &&
      typeof payload.agentReplyCountVisibility === "object"
        ? payload.agentReplyCountVisibility
        : existingSettings.agentReplyCountVisibility,
    lastCommentAgentResponseVisibility:
      payload.lastCommentAgentResponseVisibility &&
      typeof payload.lastCommentAgentResponseVisibility === "object"
        ? payload.lastCommentAgentResponseVisibility
        : existingSettings.lastCommentAgentResponseVisibility,
    lastAgentResponseDateVisibility:
      payload.lastAgentResponseDateVisibility &&
      typeof payload.lastAgentResponseDateVisibility === "object"
        ? payload.lastAgentResponseDateVisibility
        : existingSettings.lastAgentResponseDateVisibility,
  };
  await storage.set(storageKey, newSettings);
  // Update cache after saving to storage, always using latest from storage
  try {
    const cacheClient = cache.connect();
    const latestSettings = await storage.get(storageKey);
    await cacheClient.set(storageKey, JSON.stringify(latestSettings), {
      ttlSeconds: 3600,
    });
  } catch (cacheError) {}
  return {
    success: true,
    message: "Settings saved successfully",
  };
}
