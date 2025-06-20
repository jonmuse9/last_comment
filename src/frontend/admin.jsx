import React, { useState, useEffect } from "react";
import ForgeReconciler, {
  Box,
  Text,
  Inline,
  SectionMessage,
  xcss,
  useTranslation,
  I18nProvider,
} from "@forge/react";
import { view } from "@forge/bridge";
import { getLink } from "./components/staticInfo";
import LicenseError from "../../flowzira_resources/components/licenseError";
import LoadingSpinner from "../../flowzira_resources/components/spinner";
import LogoWithLinks from "../../flowzira_resources/components/logoWithLinks";
import boxBorderStyle from "./components/seeBorders";
import { USE_LICENSE } from "../resources/properties";
import ProjectAdminSync from "./components/project_admin_sync";

// Main component with translations
const AdminPageContent = () => {
  const { ready, t } = useTranslation();
  if (!ready) {
    return <LoadingSpinner />;
  }

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
        setProjectKey(currentProjectKey); // Check if license exists and set active state with debugging
        console.log("Admin License Debug:", {
          USE_LICENSE,
          contextLicense: context.license,
          environmentType: context.environmentType,
        });

        if (USE_LICENSE === false) {
          console.log("Admin: License not used, setting active to true");
          setLicenseActive(true);
        } else if (USE_LICENSE === true) {
          if (context.license) {
            console.log(
              "Admin: License object found, active status:",
              context.license.active
            );
            setLicenseActive(context.license.active);
          } else {
            console.log(
              "Admin: USE_LICENSE is true but no license object found, setting to false"
            );
            setLicenseActive(false);
          }
        } else {
          console.log(
            "Admin: USE_LICENSE value is unexpected:",
            USE_LICENSE,
            "setting to false"
          );
          setLicenseActive(false);
        }
      } catch (error) {
        console.error("Error during initialization:", error);
        setApiError(
          t(
            "ui.messages.failedToInitialize",
            "Failed to initialize application."
          )
        );
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    };

    // Only run once when component mounts
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized]); // Loading state - explicit return to avoid React Error #130
  if (isLoading) {
    return <LoadingSpinner t={t} />;
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
          {!licenseActive && <LicenseError t={t} />}
          {apiError && (
            <Box xcss={xcss({ marginBottom: "space.300", ...boxBorderStyle })}>
              {" "}
              <SectionMessage
                appearance="error"
                title={t("ui.status.error", "Error")}
                testId="api-error-message"
              >
                <Text>{apiError}</Text>
              </SectionMessage>{" "}
            </Box>
          )}{" "}
          {/* Sync Section */}
          <ProjectAdminSync
            isLoading={isLoading}
            isGlobalAdmin={true}
            licenseActive={licenseActive}
          />
        </Box>
        <Box xcss={xcss({ flexGrow: 0.25, ...boxBorderStyle })}>
          {" "}
          <LogoWithLinks
            documentationUrl={getLink("DOCUMENTATION")}
            documentationLabel={t("ui.links.documentation", "Documentation")}
            supportUrl={getLink("SUPPORT")}
            supportLabel={t("ui.links.support", "Flowzira Support")}
          />
        </Box>
      </Inline>
    </>
  );
};

// Wrapper component with I18nProvider
const AdminPage = () => {
  return (
    <I18nProvider>
      <AdminPageContent />
    </I18nProvider>
  );
};

// Render using ForgeReconciler as per coding standards
ForgeReconciler.render(
  <React.StrictMode>
    <AdminPage />
  </React.StrictMode>
);
