// Define visibility options as a constant with translation keys
const VISIBILITY_OPTIONS_KEYS = [
  { labelKey: "ui.visibility.allComments", value: "all" },
  { labelKey: "ui.visibility.publicOnly", value: "public" },
  { labelKey: "ui.visibility.internalOnly", value: "internal" },
];

// Helper function to get translated visibility options
const getVisibilityOptions = (t) => {
  return VISIBILITY_OPTIONS_KEYS.map((option) => ({
    label: t(option.labelKey, getDefaultLabel(option.value)),
    value: option.value,
  }));
};

// Helper to get default English labels as fallback
const getDefaultLabel = (value) => {
  switch (value) {
    case "all":
      return "All comments";
    case "public":
      return "Public comments only";
    case "internal":
      return "Internal comments only";
    default:
      return value;
  }
};

// Static visibility options for backward compatibility (uses English labels)
const VISIBILITY_OPTIONS = [
  { label: "All comments", value: "all" },
  { label: "Public comments only", value: "public" },
  { label: "Internal comments only", value: "internal" },
];

// Helper to find option object by value
const findOptionByValue = (value) => {
  return (
    VISIBILITY_OPTIONS.find((option) => option.value === value) ||
    VISIBILITY_OPTIONS[0]
  );
};

export {
  VISIBILITY_OPTIONS,
  VISIBILITY_OPTIONS_KEYS,
  getVisibilityOptions,
  findOptionByValue,
};
