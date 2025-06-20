import api, { route } from "@forge/api";
import { getAppSettings } from "./resolvers/settings.js";
import cache from "@forge/cache";

/**
 * Fetches JSM comments for an issue and filters them based on admin settings.
 *
 * @param {string} issueId - The ID of the issue to get comments for
 * @param {Object} options - Optional parameters
 * @param {boolean} options.bypassVisibilityFilter - If true, ignores the jsmCommentVisibility setting
 * @param {string} options.forceVisibility - Forces a specific visibility ("all", "public", "internal")
 * @param {string} callerName - Name of the function calling getJSMComments, for logging purposes
 * @returns {Promise<Object>} - The filtered comments based on admin settings or specified options
 */

const getJSMComments = async (
  issueId,
  options = {},
  callerName = "unknown"
) => {
  // Validate input
  if (!issueId) {
    console.error(`[${callerName}] Missing required parameter: issueId`);
    return { comments: [] };
  }

  // Accept pre-fetched app settings to avoid extra API calls
  const providedSettings = options.appSettings;

  // Get the comment visibility setting unless bypassed
  let visibilitySetting = "all";

  if (!options.bypassVisibilityFilter) {
    try {
      let settings;
      if (providedSettings) {
        settings = providedSettings;
      } else {
        // Use projectId from options if provided
        settings = await getAppSettings(options.projectId);
      }
      // Handle both string and object format for backward compatibility
      if (
        typeof settings.jsmCommentVisibility === "object" &&
        settings.jsmCommentVisibility.value
      ) {
        visibilitySetting = settings.jsmCommentVisibility.value;
      } else if (typeof settings.jsmCommentVisibility === "string") {
        visibilitySetting = settings.jsmCommentVisibility;
      }
    } catch (error) {
      console.error(
        `[${callerName}] Error getting visibility settings:`,
        error
      );
      // Default to "all" if there's an error
      visibilitySetting = "all";
    }
  }

  // Override with forced visibility if specified
  if (options.forceVisibility) {
    visibilitySetting = options.forceVisibility;
  }

  try {
    // Fetch all comments from the API
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueId}/comment`);

    // Handle potential API errors
    if (!response.ok) {
      console.error(
        `[${callerName}] Failed to fetch comments for issue ${issueId}: ${response.status} ${response.statusText}`
      );
      return { comments: [] }; // Return empty comments array on API error
    }
    const data = await response.json();

    // Ensure comments property exists
    if (!data || !data.comments) {
      return { comments: [] };
    }

    // Return early if we want all comments
    if (visibilitySetting === "all") {
      return data;
    }

    // Filter comments based on visibility setting
    let filteredComments;

    if (visibilitySetting === "public") {
      // Filter to only include public comments (visible to customers)
      filteredComments = data.comments.filter(
        (comment) =>
          comment.visibility &&
          comment.visibility.type === "role" &&
          comment.visibility.value === "customers"
      );
    } else if (visibilitySetting === "internal") {
      // Filter to only include internal comments (not visible to customers)
      filteredComments = data.comments.filter(
        (comment) =>
          !comment.visibility ||
          comment.visibility.type !== "role" ||
          comment.visibility.value !== "customers"
      );
    } else {
      // Default to returning all comments
      return data;
    }

    // Return filtered comments
    return {
      ...data,
      comments: filteredComments,
    };
  } catch (error) {
    // Enhanced error logging with detailed information
    console.error(
      `[${callerName}] Error fetching comments for issue ${issueId}:`,
      {
        message: error.message,
        name: error.name,
        cause: error.cause
          ? {
              code: error.cause.code,
              message: error.cause.message,
            }
          : "No cause",
        stack: error.stack?.split("\n")[0] || "No stack trace",
      }
    );

    // Return a safe default on error
    return { comments: [] };
  }
};

// Helper function to get project ID from issue ID
const getProjectId = async (issueId) => {
  try {
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueId}`);
    if (!response.ok) {
      console.error(
        `Failed to fetch issue data for ${issueId}: ${response.status}`
      );
      return null;
    }
    const data = await response.json();
    return data.fields?.project?.id;
  } catch (error) {
    console.error(`Error fetching project ID for issue ${issueId}:`, error);
    return null;
  }
};

// Helper to fetch and cache the Service Desk Team role ID (accepts teamName, uses @forge/cache)
const getServiceDeskTeamRoleId = async (teamName = "Service Desk Team") => {
  const cacheKey = `serviceDeskTeamRoleId:${teamName}`;
  const cacheClient = cache.connect();
  try {
    const cached = await cacheClient.get(cacheKey);
    if (cached) {
      const { id, ts } = JSON.parse(cached);
      if (Date.now() - ts < 12 * 60 * 60 * 1000) return id;
    }
  } catch {}
  try {
    const resp = await api.asApp().requestJira(route`/rest/api/3/role`);
    if (!resp.ok) {
      console.error(
        `[getServiceDeskTeamRoleId] Failed to fetch roles: ${resp.status}`
      );
      return null;
    }
    const roles = await resp.json();
    const serviceDeskTeamRole = Array.isArray(roles)
      ? roles.find((role) => role.name === teamName)
      : null;
    if (serviceDeskTeamRole && serviceDeskTeamRole.id) {
      await cacheClient.set(
        cacheKey,
        JSON.stringify({ id: serviceDeskTeamRole.id, ts: Date.now() }),
        { ttlSeconds: 3600 } // 1 hour - maximum allowed
      );
      return serviceDeskTeamRole.id;
    } else {
      console.error(`[getServiceDeskTeamRoleId] '${teamName}' role not found.`);
      return null;
    }
  } catch (error) {
    console.error(`[getServiceDeskTeamRoleId] Error fetching roles:`, error);
    return null;
  }
};

// Helper to fetch and cache agent accountIds for a project using the Service Desk Team role (now accepts teamName, uses @forge/cache)
const getProjectAgentAccountIds = async (
  projectId,
  teamName = "Service Desk Team"
) => {
  if (!projectId) return [];
  const cacheKey = `projectAgentAccountIds:${projectId}::${teamName}`;
  const cacheClient = cache.connect();
  try {
    const cached = await cacheClient.get(cacheKey);
    if (cached) {
      const { ids, ts } = JSON.parse(cached);
      if (Date.now() - ts < 12 * 60 * 60 * 1000) return ids;
    }
  } catch {}
  try {
    const roleId = await getServiceDeskTeamRoleId(teamName);
    if (!roleId) return [];
    const resp = await api
      .asApp()
      .requestJira(route`/rest/api/3/project/${projectId}/role/${roleId}`);
    if (!resp.ok) {
      console.error(
        `[getProjectAgentAccountIds] Failed to fetch role actors for project ${projectId}: ${resp.status}`
      );
      return [];
    }
    const data = await resp.json();
    // The actors array contains users and groups; we want users (type: 'atlassian-user-role-actor')
    const agentAccountIds = (data.actors || [])
      .filter(
        (actor) =>
          actor.type === "atlassian-user-role-actor" &&
          actor.actorUser &&
          actor.actorUser.accountId
      )
      .map((actor) => actor.actorUser.accountId);
    await cacheClient.set(
      cacheKey,
      JSON.stringify({ ids: agentAccountIds, ts: Date.now() }),
      { ttlSeconds: 3600 } // 1 hour - maximum allowed
    );
    return agentAccountIds;
  } catch (error) {
    console.error(
      `[getProjectAgentAccountIds] Error fetching agent accountIds for project ${projectId}:`,
      error
    );
    return [];
  }
};

/*
 * JSM specific functions
 * These functions are specific to Jira Service Management and may not work in other Jira products.
 */

export const getPublicCommentCount = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error("Invalid arguments provided to getPublicCommentCount:", args);
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return 0;
      }
      try {
        const comments = await getJSMComments(
          issue.id,
          {
            forceVisibility: "public",
            appSettings,
          },
          "getPublicCommentCount"
        );
        return comments && comments.comments ? comments.comments.length : 0;
      } catch (error) {
        console.error(
          `Error in getPublicCommentCount for issue ${issue.id}:`,
          error
        );
        return 0;
      }
    })
  );
};

export const getAgentReplyCount = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error("Invalid arguments provided to getAgentReplyCount:", args);
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return 0;
      }
      try {
        const projectId = await getProjectId(issue.id);
        const agentAccountIds = await getProjectAgentAccountIds(projectId);
        let visibilitySetting = "all";
        try {
          let settings = appSettings || (await getAppSettings(projectId));
          if (settings && settings.agentReplyCountVisibility) {
            if (
              typeof settings.agentReplyCountVisibility === "object" &&
              settings.agentReplyCountVisibility.value
            ) {
              visibilitySetting = settings.agentReplyCountVisibility.value;
            } else if (typeof settings.agentReplyCountVisibility === "string") {
              visibilitySetting = settings.agentReplyCountVisibility;
            }
          }
        } catch (error) {
          console.error(
            `[getAgentReplyCount] Error getting visibility settings for project ${projectId}:`,
            error
          );
          visibilitySetting = "all";
        }
        const comments = await getJSMComments(
          issue.id,
          {
            forceVisibility: visibilitySetting,
            projectId,
            appSettings,
          },
          "getAgentReplyCount"
        );
        if (!comments || !comments.comments) {
          return 0;
        }
        const agentComments = comments.comments.filter(
          (comment) =>
            comment &&
            comment.author &&
            agentAccountIds.includes(comment.author.accountId)
        );
        return agentComments.length;
      } catch (error) {
        console.error(
          `Error in getAgentReplyCount for issue ${issue.id}:`,
          error
        );
        return 0;
      }
    })
  );
};

export const getCustomerReplyCount = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error("Invalid arguments provided to getCustomerReplyCount:", args);
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return 0;
      }
      try {
        const comments = await getJSMComments(
          issue.id,
          {
            appSettings,
          },
          "getCustomerReplyCount"
        );
        if (!comments || !comments.comments) {
          return 0;
        }
        const customerComments = comments.comments.filter(
          (comment) =>
            comment &&
            comment.author &&
            comment.author.roles &&
            comment.author.roles.items &&
            Array.isArray(comment.author.roles.items) &&
            comment.author.roles.items.find(
              (role) => role && role.name === "Customer"
            )
        );
        return customerComments.length;
      } catch (error) {
        console.error(
          `Error in getCustomerReplyCount for issue ${issue.id}:`,
          error
        );
        return 0;
      }
    })
  );
};

export const isLastCommenterCustomer = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error(
      "Invalid arguments provided to isLastCommenterCustomer:",
      args
    );
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return "False";
      }
      try {
        const comments = await getJSMComments(
          issue.id,
          {
            appSettings,
          },
          "isLastCommenterCustomer"
        );
        if (!comments || !comments.comments || comments.comments.length === 0) {
          return "False";
        }
        const lastComment = comments.comments[comments.comments.length - 1];
        return lastComment &&
          lastComment.author &&
          lastComment.author.roles &&
          lastComment.author.roles.items &&
          Array.isArray(lastComment.author.roles.items) &&
          lastComment.author.roles.items.find(
            (role) => role && role.name === "Customer"
          ) !== undefined
          ? "True"
          : "False";
      } catch (error) {
        console.error(
          `Error in isLastCommenterCustomer for issue ${issue.id}:`,
          error
        );
        return "False";
      }
    })
  );
};

export const isLastCommentInternal = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error("Invalid arguments provided to isLastCommentInternal:", args);
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return "False";
      }
      try {
        const comments = await getJSMComments(
          issue.id,
          {
            bypassVisibilityFilter: true,
            appSettings,
          },
          "isLastCommentInternal"
        );
        if (!comments || !comments.comments || comments.comments.length === 0) {
          return "False";
        }
        const lastComment = comments.comments[comments.comments.length - 1];
        // Use jsdPublic as the flag to determine if it is internal
        let isInternal = true;
        if (typeof lastComment.jsdPublic !== "undefined") {
          isInternal = !lastComment.jsdPublic;
        }
        return isInternal ? "True" : "False";
      } catch (error) {
        console.error(
          `Error in isLastCommentInternal for issue ${issue.id}:`,
          error
        );
        return "False";
      }
    })
  );
};

export const isLastCommentAgentResponse = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error(
      "Invalid arguments provided to isLastCommentAgentResponse:",
      args
    );
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return "False";
      }
      try {
        const projectId = await getProjectId(issue.id);
        const agentAccountIds = await getProjectAgentAccountIds(projectId);
        let visibilitySetting = "all";
        try {
          let settings = appSettings || (await getAppSettings(projectId));
          if (settings && settings.lastCommentAgentResponseVisibility) {
            if (
              typeof settings.lastCommentAgentResponseVisibility === "object" &&
              settings.lastCommentAgentResponseVisibility.value
            ) {
              visibilitySetting =
                settings.lastCommentAgentResponseVisibility.value;
            } else if (
              typeof settings.lastCommentAgentResponseVisibility === "string"
            ) {
              visibilitySetting = settings.lastCommentAgentResponseVisibility;
            }
          }
        } catch (error) {
          console.error(
            `[isLastCommentAgentResponse] Error getting visibility settings for project ${projectId}:`,
            error
          );
          visibilitySetting = "all";
        }
        const comments = await getJSMComments(
          issue.id,
          {
            forceVisibility: visibilitySetting,
            projectId,
            appSettings,
          },
          "isLastCommentAgentResponse"
        );
        if (!comments || !comments.comments || comments.comments.length === 0) {
          console.log(
            `[isLastCommentAgentResponse] No comments found for issue ${issue.id}`
          );
          return "False";
        }
        const lastComment = comments.comments[comments.comments.length - 1];
        const isAgent =
          lastComment &&
          lastComment.author &&
          agentAccountIds.includes(lastComment.author.accountId);
        return isAgent ? "True" : "False";
      } catch (error) {
        console.error(
          `Error in isLastCommentAgentResponse for issue ${issue.id}:`,
          error
        );
        return "False";
      }
    })
  );
};

export const getLastAgentResponseDate = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error(
      "Invalid arguments provided to getLastAgentResponseDate:",
      args
    );
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return null;
      }
      try {
        const projectId = await getProjectId(issue.id);
        const agentAccountIds = await getProjectAgentAccountIds(projectId);
        let visibilitySetting = "all";
        try {
          let settings = appSettings || (await getAppSettings(projectId));
          if (settings && settings.lastAgentResponseDateVisibility) {
            if (
              typeof settings.lastAgentResponseDateVisibility === "object" &&
              settings.lastAgentResponseDateVisibility.value
            ) {
              visibilitySetting =
                settings.lastAgentResponseDateVisibility.value;
            } else if (
              typeof settings.lastAgentResponseDateVisibility === "string"
            ) {
              visibilitySetting = settings.lastAgentResponseDateVisibility;
            }
          }
        } catch (error) {
          console.error(
            `[getLastAgentResponseDate] Error getting visibility settings for project ${projectId}:`,
            error
          );
          visibilitySetting = "all";
        }
        const comments = await getJSMComments(
          issue.id,
          {
            forceVisibility: visibilitySetting,
            projectId,
            appSettings,
          },
          "getLastAgentResponseDate"
        );
        if (!comments || !comments.comments || comments.comments.length === 0) {
          return null;
        }
        const agentComments = comments.comments.filter(
          (comment) =>
            comment &&
            comment.author &&
            agentAccountIds.includes(comment.author.accountId)
        );
        if (agentComments.length === 0) {
          return null;
        }
        const lastAgentComment = agentComments[agentComments.length - 1];
        return lastAgentComment.created;
      } catch (error) {
        console.error(
          `Error in getLastAgentResponseDate for issue ${issue.id}:`,
          error
        );
        return null;
      }
    })
  );
};

export const getLastCustomerCommentDate = async (args) => {
  if (!args || !args.issues || !Array.isArray(args.issues)) {
    console.error(
      "Invalid arguments provided to getLastCustomerCommentDate:",
      args
    );
    return [];
  }
  const appSettings = args.appSettings;
  return Promise.all(
    args.issues.map(async (issue) => {
      if (!issue || !issue.id) {
        console.error("Invalid issue object:", issue);
        return null;
      }
      try {
        const comments = await getJSMComments(
          issue.id,
          {
            appSettings,
          },
          "getLastCustomerCommentDate"
        );
        if (!comments || !comments.comments || comments.comments.length === 0) {
          return null;
        }
        const customerComments = comments.comments.filter(
          (comment) =>
            comment &&
            comment.author &&
            comment.author.roles &&
            comment.author.roles.items &&
            Array.isArray(comment.author.roles.items) &&
            comment.author.roles.items.find(
              (role) => role && role.name === "Customer"
            )
        );
        if (customerComments.length === 0) {
          return null;
        }
        const lastCustomerComment =
          customerComments[customerComments.length - 1];
        return lastCustomerComment.created;
      } catch (error) {
        console.error(
          `Error in getLastCustomerCommentDate for issue ${issue.id}:`,
          error
        );
        return null;
      }
    })
  );
};
