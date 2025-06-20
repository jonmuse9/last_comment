import React, { useState, useEffect } from "react";
import ForgeReconciler, {
  Box,
  Text,
  Inline,
  SectionMessage,
  xcss,
} from "@forge/react";
import { view } from "@forge/bridge";
import { getLink } from "./components/staticInfo";
import licenseWarning from "../flowzira_resources/components/licenseError";
import spinner from "../flowzira_resources/components/spinner";
import LogoWithLinks from "../flowzira_resources/components/logoWithLinks";
import boxBorderStyle from "./components/seeBorders";
import { USE_LICENSE } from "../resources/properties";
import ProjectAdminSync from "./components/project_admin_sync";

// Main component
const AdminPage = () => {
  // State variables with proper initialization
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [licenseActive, setLicenseActive] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projectKey, setProjectKey] = useState(null);

  // Fetch initial settings - with proper dependency array
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true);
        const context = await view.getContext();
        const currentProjectId = context.extension?.project?.id;
        const currentProjectKey = context.extension?.project?.key;
        setProjectId(currentProjectId);
        setProjectKey(currentProjectKey);

        // Check if license exists and set active state
        if (USE_LICENSE && context.license) {
          setLicenseActive(context.license.active);
        } else if (USE_LICENSE === false) {
          setLicenseActive(true); // Default to true if no license is used
        }
      } catch (error) {
        console.error("Error during initialization:", error);
        setApiError("Failed to initialize application.");
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };

    // Only run once when component mounts
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized]);
  // Loading state - explicit return to avoid React Error #130
  if (isLoading) {
    return spinner;
  }

  return (
    <>
      <Inline space="space.200" alignBlock="start">
        <Box
          xcss={xcss({
            flexGrow: 0.75,
            ...boxBorderStyle,
          })}
        >
          {!licenseActive && licenseWarning}
          {apiError && (
            <Box xcss={xcss({ marginBottom: "space.300", ...boxBorderStyle })}>
              <SectionMessage
                appearance="error"
                title="Error"
                testId="api-error-message"
              >
                <Text>{apiError}</Text>
              </SectionMessage>{" "}
            </Box>
          )}
          {/* Sync Section */}
          <ProjectAdminSync isLoading={isLoading} isGlobalAdmin={true} />
        </Box>
        <Box xcss={xcss({ flexGrow: 0.25, ...boxBorderStyle })}>
          <LogoWithLinks
            documentationUrl={getLink("DOCUMENTATION")}
            documentationLabel="Documentation"
            supportUrl={getLink("SUPPORT")}
            supportLabel="Flowzira Support"
          />
        </Box>
      </Inline>
    </>
  );
};

// Render using ForgeReconciler as per coding standards
ForgeReconciler.render(
  <React.StrictMode>
    <AdminPage />
  </React.StrictMode>
);
