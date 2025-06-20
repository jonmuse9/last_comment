import React, { useState, useEffect } from "react";
import ForgeReconciler, {
  Form,
  FormHeader,
  FormSection,
  FormFooter,
  Box,
  Label,
  Select,
  Button,
  useForm,
  Text,
  Inline,
  SectionMessage,
  xcss,
  HelperMessage,
  Stack,
} from "@forge/react";
import { invoke, view } from "@forge/bridge";
import { getLink } from "./components/staticInfo";
import licenseWarning from "../flowzira_resources/components/licenseError";
import spinner from "../flowzira_resources/components/spinner";
import LogoWithLinks from "../flowzira_resources/components/logoWithLinks";
import {
  VISIBILITY_OPTIONS,
  findOptionByValue,
} from "./components/visibilityOptions";
import boxBorderStyle from "./components/seeBorders";
import { USE_LICENSE } from "../resources/properties";
import ProjectAdminSync from "./components/project_admin_sync";

// Main component
const AdminPage = () => {
  // State variables with proper initialization
  const [agentReplyCountSettings, setAgentReplyCountSettings] = useState(
    VISIBILITY_OPTIONS[0]
  );
  const [
    lastCommentAgentResponseSettings,
    setLastCommentAgentResponseSettings,
  ] = useState(VISIBILITY_OPTIONS[0]);
  const [lastAgentResponseDateSettings, setLastAgentResponseDateSettings] =
    useState(VISIBILITY_OPTIONS[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [licenseActive, setLicenseActive] = useState(false);
  const [isJSM, setIsJSM] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projectKey, setProjectKey] = useState(null);

  // Initialize form hooks with reset capability
  const { handleSubmit, register, getFieldId, formState } = useForm({
    defaultValues: {
      getAgentReplyCount: agentReplyCountSettings.value,
      isLastCommentAgentResponse: lastCommentAgentResponseSettings.value,
      getLastAgentResponseDate: lastAgentResponseDateSettings.value,
    },
  });

  // Fetch initial settings - with proper dependency array
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsLoading(true); // First, check license and JSM status
        const context = await view.getContext(); // Store the project ID for use in API calls
        const currentProjectId = context.extension?.project?.id;
        const currentProjectKey = context.extension?.project?.key;
        setProjectId(currentProjectId);
        setProjectKey(currentProjectKey);

        // Check if the environment is JSM using strict equality
        const isJsmEnvironment =
          context.extension?.project?.type === "service_desk";

        setIsJSM(isJsmEnvironment);
        // Check if license exists and set active state
        if (USE_LICENSE && context.license) {
          setLicenseActive(context.license.active);
        } else if (USE_LICENSE === false) {
          setLicenseActive(true); // Default to true if no license is used
        } // Only fetch settings if in a JSM environment
        if (isJsmEnvironment) {
          // Create a helper function that uses the current project ID
          const fetchSettingsWithProjectId = async () => {
            try {
              setApiError(null);
              setSuccessMessage(null);

              // Load app settings with project ID
              try {
                const settings = await invoke("getAppSettings", {
                  projectId: currentProjectId,
                });

                if (settings) {
                  // Set individual settings if they exist in the response
                  if (settings.agentReplyCountVisibility) {
                    setAgentReplyCountSettings(
                      settings.agentReplyCountVisibility
                    );
                  } else {
                    setAgentReplyCountSettings(VISIBILITY_OPTIONS[0]);
                  }

                  if (settings.lastCommentAgentResponseVisibility) {
                    setLastCommentAgentResponseSettings(
                      settings.lastCommentAgentResponseVisibility
                    );
                  } else {
                    setLastCommentAgentResponseSettings(VISIBILITY_OPTIONS[0]);
                  }

                  if (settings.lastAgentResponseDateVisibility) {
                    setLastAgentResponseDateSettings(
                      settings.lastAgentResponseDateVisibility
                    );
                  } else {
                    setLastAgentResponseDateSettings(VISIBILITY_OPTIONS[0]);
                  }
                } else {
                  // Set defaults if no settings exist
                  setAgentReplyCountSettings(VISIBILITY_OPTIONS[0]);
                  setLastCommentAgentResponseSettings(VISIBILITY_OPTIONS[0]);
                  setLastAgentResponseDateSettings(VISIBILITY_OPTIONS[0]);
                }
              } catch (error) {
                setApiError("Unable to load settings. Using default values.");
                setAgentReplyCountSettings(VISIBILITY_OPTIONS[0]);
                setLastCommentAgentResponseSettings(VISIBILITY_OPTIONS[0]);
                setLastAgentResponseDateSettings(VISIBILITY_OPTIONS[0]);
              }
            } catch (error) {
              setApiError("Failed to initialize application settings.");
            }
          };
          await fetchSettingsWithProjectId();
        }
        // Fetch sync log immediately on load
        try {
          const log = await invoke("getSyncLog");
          setSyncLog(log);
        } catch (e) {
          // Ignore log fetch error on load
        }
      } catch (error) {
        console.error("Error during initialization:", error);
        setApiError("Failed to initialize application.");
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    }; // Note: fetchSettings was replaced by inline fetchSettingsWithProjectId

    // Only run once when component mounts
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized]); // Proper dependency array

  const saveJsmSettings = async (formData) => {
    try {
      setIsSubmitting(true);
      setApiError(null);
      setSuccessMessage(null);

      // Extract all visibility settings from form data
      const agentReplyCount = formData.getAgentReplyCount;
      const lastCommentAgentResponse = formData.isLastCommentAgentResponse;
      const lastAgentResponseDate = formData.getLastAgentResponseDate;

      // Validate required fields
      if (
        !agentReplyCount ||
        !lastCommentAgentResponse ||
        !lastAgentResponseDate
      ) {
        setApiError("All visibility selections are required");
        return false;
      }

      // Prepare payload with all settings
      const payload = {
        agentReplyCountVisibility: agentReplyCount,
        lastCommentAgentResponseVisibility: lastCommentAgentResponse,
        lastAgentResponseDateVisibility: lastAgentResponseDate,
      };
      const result = await invoke("saveAppSettings", { payload, projectId });

      if (result && result.success) {
        // Update all settings states
        setAgentReplyCountSettings(findOptionByValue(agentReplyCount));
        setLastCommentAgentResponseSettings(
          findOptionByValue(lastCommentAgentResponse)
        );
        setLastAgentResponseDateSettings(
          findOptionByValue(lastAgentResponseDate)
        );
        setSuccessMessage("Settings saved successfully!");
        return true;
      } else {
        setApiError(
          "Unexpected response from server. Settings might not have been saved."
        );
        return false;
      }
    } catch (error) {
      setApiError(
        `Failed to save settings: ${error.message || "Unknown error"}`
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Reset form to current settings
    setApiError(null);
    setSuccessMessage(null);
  };
  // Loading state - explicit return to avoid React Error #130
  if (isLoading) {
    return spinner;
  }

  // --- SYNC SECTION ---
  return (
    <>
      <Inline space="space.200" alignBlock="start">
        <Box
          xcss={xcss({
            flexGrow: 0.75,
            ...boxBorderStyle,
          })}
        >
          {!licenseActive && licenseWarning}{" "}
          {apiError && (
            <Box xcss={xcss({ marginBottom: "space.300", ...boxBorderStyle })}>
              <SectionMessage
                appearance="error"
                title="Error"
                testId="api-error-message"
              >
                <Text>{apiError}</Text>
              </SectionMessage>
            </Box>
          )}
          {successMessage && (
            <Box xcss={xcss({ marginBottom: "space.300", ...boxBorderStyle })}>
              <SectionMessage
                appearance="success"
                title="Success"
                testId="success-message"
              >
                <Text>{successMessage}</Text>
              </SectionMessage>
            </Box>
          )}
          {isJSM ? (
            <Box xcss={xcss({ width: "50%", ...boxBorderStyle })}>
              <Form onSubmit={handleSubmit(saveJsmSettings)}>
                <Stack space="space.300">
                  <FormHeader title="Jira Service Management Settings">
                    The visibility Filter defines the comments used to build the
                    custom field values. This feature is only useful in Jira
                    Service Management.
                  </FormHeader>
                  <FormSection>
                    <Stack space="space.200">
                      <Inline grow="fill" alignBlock="center" space="space.100">
                        <Box xcss={boxBorderStyle}>
                          <Label labelFor={getFieldId("getAgentReplyCount")}>
                            Agent Reply Count
                          </Label>
                        </Box>
                        <Box xcss={xcss({ flexGrow: 0.4, ...boxBorderStyle })}>
                          <Select
                            {...register("getAgentReplyCount", {
                              required:
                                "Please select a visibility option for Agent Reply Count",
                            })}
                            options={VISIBILITY_OPTIONS}
                            defaultValue={agentReplyCountSettings}
                          />
                          {formState.errors.getAgentReplyCount && (
                            <HelperMessage appearance="error">
                              {formState.errors.getAgentReplyCount.message ||
                                "Please select a visibility option"}
                            </HelperMessage>
                          )}
                        </Box>
                      </Inline>

                      <Inline grow="fill" alignBlock="center" space="space.100">
                        <Box xcss={boxBorderStyle}>
                          <Label
                            labelFor={getFieldId("isLastCommentAgentResponse")}
                          >
                            Last Comment Agent Response
                          </Label>
                        </Box>
                        <Box xcss={xcss({ flexGrow: 0.4, ...boxBorderStyle })}>
                          <Select
                            {...register("isLastCommentAgentResponse", {
                              required:
                                "Please select a visibility option for Last Comment Agent Response",
                            })}
                            options={VISIBILITY_OPTIONS}
                            defaultValue={lastCommentAgentResponseSettings}
                          />
                          {formState.errors.isLastCommentAgentResponse && (
                            <HelperMessage appearance="error">
                              {formState.errors.isLastCommentAgentResponse
                                .message || "Please select a visibility option"}
                            </HelperMessage>
                          )}
                        </Box>
                      </Inline>
                      <Inline grow="fill" alignBlock="center" space="space.100">
                        <Box xcss={boxBorderStyle}>
                          <Label
                            labelFor={getFieldId("getLastAgentResponseDate")}
                          >
                            Get Last Agent Response Date
                          </Label>
                        </Box>
                        <Box xcss={xcss({ flexGrow: 0.4, ...boxBorderStyle })}>
                          <Select
                            {...register("getLastAgentResponseDate", {
                              required: "Please select a visibility option",
                            })}
                            options={VISIBILITY_OPTIONS}
                            defaultValue={lastAgentResponseDateSettings}
                          />
                          {formState.errors.getLastAgentResponseDate && (
                            <HelperMessage appearance="error">
                              {formState.errors.getLastAgentResponseDate
                                .message || "Please select a visibility option"}
                            </HelperMessage>
                          )}
                        </Box>
                      </Inline>
                    </Stack>
                  </FormSection>
                  <FormFooter>
                    <Inline alignInline="start">
                      <Button onClick={handleCancel} appearance="subtle">
                        Cancel
                      </Button>
                      <Button
                        appearance="primary"
                        type="submit"
                        isDisabled={isSubmitting}
                      >
                        {isSubmitting ? "Saving..." : "Save"}
                      </Button>
                    </Inline>
                  </FormFooter>
                </Stack>
              </Form>
            </Box>
          ) : null}
          {/* --- SYNC SECTION --- */}
          <ProjectAdminSync
            projectId={projectId}
            projectKey={projectKey}
            isLoading={isLoading}
            agentReplyCountSettings={agentReplyCountSettings}
            lastCommentAgentResponseSettings={lastCommentAgentResponseSettings}
            lastAgentResponseDateSettings={lastAgentResponseDateSettings}
          />
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
