// Define visibility options as a constant
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

export { VISIBILITY_OPTIONS, findOptionByValue };
