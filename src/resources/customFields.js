/**
 * Custom field mapping for Flowzira custom fields
 * Maps field keys to their display names and data types
 * For use across the application to maintain consistency
 */

export const CUSTOM_FIELD_MAP = {
  // Comment content fields
  "flowzira-last-comment-custom-field": {
    name: "Flowzira Last Comment",
    type: "string",
    category: "content",
    isJSM: false,
    calculator: "getLastComment",
  },
  "flowzira-first-comment-custom-field": {
    name: "Flowzira First Comment",
    type: "string",
    category: "content",
    isJSM: false,
    calculator: "getFirstComment",
  },

  // Comment count fields
  "flowzira-comment-count-custom-field": {
    name: "Flowzira Comment Count",
    type: "number",
    category: "count",
    isJSM: false,
    calculator: "getCommentCount",
  },
  "flowzira-internal-comment-count-custom-field": {
    name: "Flowzira Internal Comment Count",
    type: "number",
    category: "count",
    isJSM: false,
    calculator: "getInternalCommentCount",
  },
  "flowzira-public-comment-count": {
    name: "Flowzira Public Comment Count",
    type: "number",
    category: "count",
    isJSM: true,
    calculator: "getPublicCommentCount",
  },
  "flowzira-agent-reply-count": {
    name: "Flowzira Agent Reply Count",
    type: "number",
    category: "count",
    isJSM: true,
    calculator: "getAgentReplyCount",
  },
  "flowzira-customer-reply-count": {
    name: "Flowzira Customer Reply Count",
    type: "number",
    category: "count",
    isJSM: true,
    calculator: "getCustomerReplyCount",
  },

  // Date fields
  "flowzira-last-comment-date-custom-field": {
    name: "Flowzira Last Comment Date",
    type: "datetime",
    category: "date",
    isJSM: false,
    calculator: "getLastCommentDate",
  },
  "flowzira-first-comment-date-custom-field": {
    name: "Flowzira First Comment Date",
    type: "datetime",
    category: "date",
    isJSM: false,
    calculator: "getFirstCommentDate",
  },
  "flowzira-last-assignee-comment-date-custom-field": {
    name: "Flowzira Last Assignee Comment Date",
    type: "datetime",
    category: "date",
    isJSM: false,
    calculator: "getLastAssigneeCommentDate",
  },
  "flowzira-last-agent-response-date": {
    name: "Flowzira Last Agent Response Date",
    type: "date",
    category: "date",
    isJSM: true,
    calculator: "getLastAgentResponseDate",
  },
  "flowzira-last-customer-comment-date": {
    name: "Flowzira Last Customer Comment Date",
    type: "date",
    category: "date",
    isJSM: true,
    calculator: "getLastCustomerCommentDate",
  },

  // Commenter identity fields
  "flowzira-last-commenter-name-custom-field": {
    name: "Flowzira Last Commenter",
    type: "string",
    category: "identity",
    isJSM: false,
    calculator: "getLastCommenter",
  },
  "flowzira-first-commenter-name-custom-field": {
    name: "Flowzira First Commenter",
    type: "string",
    category: "identity",
    isJSM: false,
    calculator: "getFirstCommenter",
  },

  // Boolean-like fields (represented as strings)
  "flowzira-last-commenter-is-assignee-custom-field": {
    name: "Flowzira Last Commenter is Assignee",
    type: "string",
    category: "boolean",
    isJSM: false,
    calculator: "isLastCommenterAssignee",
  },
  "flowzira-last-commenter-is-reporter": {
    name: "Flowzira Last Commenter is Reporter",
    type: "string",
    category: "boolean",
    isJSM: false,
    calculator: "isLastCommenterReporter",
  },
  "flowzira-last-commenter-is-creator-custom-field": {
    name: "Flowzira Last Commenter is Creator",
    type: "string",
    category: "boolean",
    isJSM: false,
    calculator: "isLastCommenterCreator",
  },
  "flowzira-first-commenter-is-assignee-custom-field": {
    name: "Flowzira First Commenter is Assignee",
    type: "string",
    category: "boolean",
    isJSM: false,
    calculator: null,
  },
  "flowzira-first-commenter-is-reporter-custom-field": {
    name: "Flowzira First Commenter is Reporter",
    type: "string",
    category: "boolean",
    isJSM: false,
    calculator: null,
  },
  "flowzira-first-commenter-is-creator-custom-field": {
    name: "Flowzira First Commenter is Creator",
    type: "string",
    category: "boolean",
    isJSM: false,
    calculator: null,
  },
  "flowzira-last-commenter-is-customer": {
    name: "Flowzira Last Commenter is Customer",
    type: "string",
    category: "boolean",
    isJSM: true,
    calculator: "isLastCommenterCustomer",
  },
  "flowzira-last-comment-is-internal": {
    name: "Flowzira Last Comment is Internal",
    type: "string",
    category: "boolean",
    isJSM: true,
    calculator: "isLastCommentInternal",
  },
  "flowzira-last-comment-is-agent-response": {
    name: "Flowzira Last Comment is Agent Response",
    type: "string",
    category: "boolean",
    isJSM: true,
    calculator: "isLastCommentAgentResponse",
  },
};

/**
 * Get fields by category
 * @param {string} category - The category to filter by
 * @returns {Object} Object containing fields of the requested category
 */
export const getFieldsByCategory = (category) => {
  return Object.entries(CUSTOM_FIELD_MAP)
    .filter(([_, fieldInfo]) => fieldInfo.category === category)
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
};

/**
 * Get field information by key
 * @param {string} fieldKey - The field key to look up
 * @returns {Object|null} Field information or null if not found
 */
export const getFieldInfo = (fieldKey) => {
  return CUSTOM_FIELD_MAP[fieldKey] || null;
};

/**
 * Get field key by display name
 * @param {string} displayName - The display name to look up
 * @returns {string|null} Field key or null if not found
 */
export const getFieldKeyByName = (displayName) => {
  const entry = Object.entries(CUSTOM_FIELD_MAP).find(
    ([_, fieldInfo]) => fieldInfo.name === displayName
  );
  return entry ? entry[0] : null;
};

/**
 * Get all JSM specific fields
 * @returns {Object} Object containing all JSM specific fields
 */
export const getJSMFields = () => {
  // These fields are specifically for Jira Service Management
  const jsmFieldKeys = [
    "flowzira-public-comment-count",
    "flowzira-agent-reply-count",
    "flowzira-customer-reply-count",
    "flowzira-last-commenter-is-customer",
    "flowzira-last-comment-is-internal",
    "flowzira-last-comment-is-agent-response",
    "flowzira-last-agent-response-date",
    "flowzira-last-customer-comment-date",
  ];

  return jsmFieldKeys.reduce((acc, key) => {
    if (CUSTOM_FIELD_MAP[key]) {
      acc[key] = CUSTOM_FIELD_MAP[key];
    }
    return acc;
  }, {});
};
