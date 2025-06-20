import React, { useState, useEffect } from "react";
import ForgeReconciler, {
  Text,
  useTranslation,
  I18nProvider,
} from "@forge/react";
import { view } from "@forge/bridge";
import { USE_LICENSE } from "../resources/properties.js";
import { getFieldInfo } from "../resources/customFields.js";

const GenericViewContent = () => {
  const { ready, t } = useTranslation();

  // All useState hooks must be called before any early returns
  const [context, setContext] = useState(null);
  const [fieldValue, setFieldValue] = useState(null);
  // Initialize licenseActive based on USE_LICENSE - if license is not used, it should be active
  const [licenseActive, setLicenseActive] = useState(USE_LICENSE === false);
  const [fieldType, setFieldType] = useState(null);

  // All useEffect hooks must be called before any early returns
  useEffect(() => {
    const fetchContext = async () => {
      const context = await view.getContext();
      setContext(context);

      if (context.environmentType === "DEVELOPMENT") {
        console.log("Context in GenericView:", JSON.stringify(context));
      }

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
      if (USE_LICENSE === false) {
        setLicenseActive(true);
      } else if (USE_LICENSE === true) {
        if (context.license) {
          setLicenseActive(context.license.active);
        } else {
          setLicenseActive(false);
        }
      } else {
        setLicenseActive(false);
      }
    }
  }, [context, fieldType]);
  // Early return check AFTER all hooks
  if (!ready) {
    return <Text>—</Text>; // Return fallback while loading translations
  }

  // Helper function to render the field value appropriately
  const renderFieldValue = () => {
    if (fieldValue === null || fieldValue === undefined) {
      return <Text>{t("ui.messages.emptyValue", "—")}</Text>; // Em dash for empty values
    }

    // For boolean fields that use string representation
    if (fieldType === "boolean" && typeof fieldValue === "string") {
      return (
        <Text>
          {fieldValue === "true"
            ? t("ui.status.yes", "Yes")
            : fieldValue === "false"
            ? t("ui.status.no", "No")
            : fieldValue}
        </Text>
      );
    }

    return <Text>{fieldValue}</Text>;
  };

  // Always return valid JSX from the render method to avoid React Error #130
  return (
    <>
      {licenseActive ? (
        renderFieldValue()
      ) : (
        <Text>
          {t("ui.messages.licenseNotActive", "License is not active")}
        </Text>
      )}
    </>
  );
};

// Wrapper component with I18nProvider
const GenericView = () => {
  return (
    <I18nProvider>
      <GenericViewContent />
    </I18nProvider>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <GenericView />
  </React.StrictMode>
);
