import React, { useState, useEffect } from "react";
import ForgeReconciler, { Text } from "@forge/react";
import { view } from "@forge/bridge";
import { USE_LICENSE } from "../resources/properties.js";
import { getFieldInfo } from "../resources/customFields.js";

const GenericView = () => {
  const [context, setContext] = useState(null);
  const [fieldValue, setFieldValue] = useState(null);
  const [licenseActive, setLicenseActive] = useState(false);
  const [fieldType, setFieldType] = useState(null);
  useEffect(() => {
    const fetchContext = async () => {
      const context = await view.getContext();
      setContext(context);

      // Get the moduleKey which corresponds to the custom field key
      if (context.moduleKey) {
        const fieldInfo = getFieldInfo(context.moduleKey);
        if (fieldInfo) {
          setFieldType(fieldInfo.type);
        }
      }
    };

    fetchContext();
  }, []);

  useEffect(() => {
    if (context) {
      // Get the raw field value
      const rawValue = context.extension?.fieldValue;

      // Process the value based on field type
      if (fieldType === "datetime" || fieldType === "date") {
        if (rawValue) {
          try {
            let date;
            if (fieldType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
              // Parse as local date to avoid timezone shift
              const [year, month, day] = rawValue.split("-").map(Number);
              date = new Date(year, month - 1, day);
            } else {
              date = new Date(rawValue);
            }
            // Check if date is valid before formatting
            if (!isNaN(date.getTime())) {
              // Use locale-specific date formatting
              const formattedDate = date.toLocaleString(
                context.locale || "en-US",
                {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "numeric",
                }
              );
              setFieldValue(formattedDate);
            } else {
              setFieldValue(rawValue); // Fallback to raw value if date is invalid
            }
          } catch (error) {
            console.error("Error formatting date:", error);
            setFieldValue(rawValue); // Fallback to raw value on error
          }
        } else {
          setFieldValue(null);
        }
      } else {
        // For non-date fields, use the value as-is
        setFieldValue(rawValue);
      }

      // Check license status
      if (USE_LICENSE && context.license) {
        setLicenseActive(context.license.active);
      } else if (USE_LICENSE === false) {
        setLicenseActive(true); // Default to true if no license is used
      }
    }
  }, [context, fieldType]);

  // Helper function to render the field value appropriately
  const renderFieldValue = () => {
    if (fieldValue === null || fieldValue === undefined) {
      return <Text>—</Text>; // Em dash for empty values
    }

    // For boolean fields that use string representation
    if (fieldType === "boolean" && typeof fieldValue === "string") {
      return (
        <Text>
          {fieldValue === "true"
            ? "Yes"
            : fieldValue === "false"
            ? "No"
            : fieldValue}
        </Text>
      );
    }

    return <Text>{fieldValue}</Text>;
  };

  // Always return valid JSX from the render method to avoid React Error #130
  return (
    <>
      {licenseActive ? renderFieldValue() : <Text>License is not active</Text>}
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <GenericView />
  </React.StrictMode>
);
