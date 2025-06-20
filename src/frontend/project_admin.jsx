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
  useTranslation,
  I18nProvider,
} from "@forge/react";
import { invoke, view } from "@forge/bridge";
import { getLink } from "./components/staticInfo";
import LicenseError from "../../flowzira_resources/components/licenseError";
import LoadingSpinner from "../../flowzira_resources/components/spinner";
import LogoWithLinks from "../../flowzira_resources/components/logoWithLinks";
import {
  VISIBILITY_OPTIONS,
  getVisibilityOptions,
  findOptionByValue,
} from "./components/visibilityOptions";
import boxBorderStyle from "./components/seeBorders";
import { USE_LICENSE } from "../resources/properties";
import ProjectAdminSync from "./components/project_admin_sync";

// Main component with translations
const AdminPageContent = () => {
  const { ready, t } = useTranslation();
  if (!ready) {
    return <LoadingSpinner />;
  }

  // Get translated visibility options
  const translatedVisibilityOptions = getVisibilityOptions(t);

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

        if (context.environmentType === "DEVELOPMENT") {
          console.log("Context fetched:", JSON.stringify(context));
        }

        // Check if the environment is JSM using strict equality
        const isJsmEnvironment =
          context.extension?.project?.type === "service_desk";

        setIsJSM(isJsmEnvironment); // Check if license exists and set active state with debugging
        console.log("Project Admin License Debug:", {
          USE_LICENSE,
          contextLicense: context.license,
          environmentType: context.environmentType,
        });

        if (USE_LICENSE === false) {
          console.log(
            "Project Admin: License not used, setting active to true"
          );
          setLicenseActive(true);
        } else if (USE_LICENSE === true) {
          if (context.license) {
            console.log(
              "Project Admin: License object found, active status:",
              context.license.active
            );
            setLicenseActive(context.license.active);
          } else {
            console.log(
              "Project Admin: USE_LICENSE is true but no license object found, setting to false"
            );
            setLicenseActive(false);
          }
        } else {
          console.log(
            "Project Admin: USE_LICENSE value is unexpected:",
            USE_LICENSE,
            "setting to false"
          );
          setLicenseActive(false);
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
                setApiError(
                  t(
                    "ui.messages.unableToLoadSettings",
                    "Unable to load settings. Using default values."
                  )
                );
                setAgentReplyCountSettings(VISIBILITY_OPTIONS[0]);
                setLastCommentAgentResponseSettings(VISIBILITY_OPTIONS[0]);
                setLastAgentResponseDateSettings(VISIBILITY_OPTIONS[0]);
              }
            } catch (error) {
              setApiError(
                t(
                  "ui.messages.failedToInitializeSettings",
                  "Failed to initialize application settings."
                )
              );
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
      const lastAgentResponseDate = formData.getLastAgentResponseDate; // Validate required fields
      if (
        !agentReplyCount ||
        !lastCommentAgentResponse ||
        !lastAgentResponseDate
      ) {
        setApiError(
          t(
            "ui.messages.allVisibilityRequired",
            "All visibility selections are required"
          )
        );
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
        setSuccessMessage(
          t("ui.messages.settingsSaved", "Settings saved successfully!")
        );
        return true;
      } else {
        setApiError(
          t(
            "ui.messages.unexpectedResponse",
            "Unexpected response from server. Settings might not have been saved."
          )
        );
        return false;
      }
    } catch (error) {
      setApiError(
        `${t("ui.messages.failedToSave", "Failed to save settings")}: ${
          error.message || t("ui.messages.unknownError", "Unknown error")
        }`
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
  }; // Loading state - explicit return to avoid React Error #130
  if (isLoading) {
    return <LoadingSpinner t={t} />;
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
          {!licenseActive && <LicenseError t={t} />}{" "}
          {apiError && (
            <Box xcss={xcss({ marginBottom: "space.300", ...boxBorderStyle })}>
              {" "}
              <SectionMessage
                appearance="error"
                title={t("ui.status.error", "Error")}
                testId="api-error-message"
              >
                <Text>{apiError}</Text>
              </SectionMessage>
            </Box>
          )}
          {successMessage && (
            <Box xcss={xcss({ marginBottom: "space.300", ...boxBorderStyle })}>
              {" "}
              <SectionMessage
                appearance="success"
                title={t("ui.status.success", "Success")}
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
                  {" "}
                  <FormHeader
                    title={t(
                      "ui.forms.jsmSettings.title",
                      "Jira Service Management Settings"
                    )}
                  >
                    {t(
                      "ui.forms.jsmSettings.description",
                      "The visibility Filter defines the comments used to build the custom field values. This feature is only useful in Jira Service Management."
                    )}
                  </FormHeader>
                  <FormSection>
                    <Stack space="space.200">
                      <Inline grow="fill" alignBlock="center" space="space.100">
                        <Box xcss={boxBorderStyle}>
                          {" "}
                          <Label labelFor={getFieldId("getAgentReplyCount")}>
                            {t(
                              "ui.forms.jsmSettings.agentReplyCount",
                              "Agent Reply Count"
                            )}
                          </Label>
                        </Box>
                        <Box xcss={xcss({ flexGrow: 0.4, ...boxBorderStyle })}>
                          <Select
                            {...register("getAgentReplyCount", {
                              required: `${t(
                                "ui.forms.jsmSettings.pleaseSelectVisibilityFor",
                                "Please select a visibility option for"
                              )} ${t(
                                "ui.forms.jsmSettings.agentReplyCount",
                                "Agent Reply Count"
                              )}`,
                            })}
                            options={translatedVisibilityOptions}
                            defaultValue={agentReplyCountSettings}
                          />
                          {formState.errors.getAgentReplyCount && (
                            <HelperMessage appearance="error">
                              {formState.errors.getAgentReplyCount.message ||
                                t(
                                  "ui.forms.jsmSettings.pleaseSelectVisibility",
                                  "Please select a visibility option"
                                )}
                            </HelperMessage>
                          )}
                        </Box>
                      </Inline>

                      <Inline grow="fill" alignBlock="center" space="space.100">
                        <Box xcss={boxBorderStyle}>
                          {" "}
                          <Label
                            labelFor={getFieldId("isLastCommentAgentResponse")}
                          >
                            {t(
                              "ui.forms.jsmSettings.lastCommentAgentResponse",
                              "Last Comment Agent Response"
                            )}
                          </Label>
                        </Box>
                        <Box xcss={xcss({ flexGrow: 0.4, ...boxBorderStyle })}>
                          <Select
                            {...register("isLastCommentAgentResponse", {
                              required: `${t(
                                "ui.forms.jsmSettings.pleaseSelectVisibilityFor",
                                "Please select a visibility option for"
                              )} ${t(
                                "ui.forms.jsmSettings.lastCommentAgentResponse",
                                "Last Comment Agent Response"
                              )}`,
                            })}
                            options={translatedVisibilityOptions}
                            defaultValue={lastCommentAgentResponseSettings}
                          />
                          {formState.errors.isLastCommentAgentResponse && (
                            <HelperMessage appearance="error">
                              {formState.errors.isLastCommentAgentResponse
                                .message ||
                                t(
                                  "ui.forms.jsmSettings.pleaseSelectVisibility",
                                  "Please select a visibility option"
                                )}
                            </HelperMessage>
                          )}
                        </Box>
                      </Inline>
                      <Inline grow="fill" alignBlock="center" space="space.100">
                        <Box xcss={boxBorderStyle}>
                          {" "}
                          <Label
                            labelFor={getFieldId("getLastAgentResponseDate")}
                          >
                            {t(
                              "ui.forms.jsmSettings.getLastAgentResponseDate",
                              "Get Last Agent Response Date"
                            )}
                          </Label>
                        </Box>
                        <Box xcss={xcss({ flexGrow: 0.4, ...boxBorderStyle })}>
                          <Select
                            {...register("getLastAgentResponseDate", {
                              required: t(
                                "ui.forms.jsmSettings.pleaseSelectVisibility",
                                "Please select a visibility option"
                              ),
                            })}
                            options={translatedVisibilityOptions}
                            defaultValue={lastAgentResponseDateSettings}
                          />
                          {formState.errors.getLastAgentResponseDate && (
                            <HelperMessage appearance="error">
                              {formState.errors.getLastAgentResponseDate
                                .message ||
                                t(
                                  "ui.forms.jsmSettings.pleaseSelectVisibility",
                                  "Please select a visibility option"
                                )}
                            </HelperMessage>
                          )}
                        </Box>
                      </Inline>
                    </Stack>
                  </FormSection>
                  <FormFooter>
                    <Inline alignInline="start">
                      {" "}
                      <Button onClick={handleCancel} appearance="subtle">
                        {t("ui.buttons.cancel", "Cancel")}
                      </Button>
                      <Button
                        appearance="primary"
                        type="submit"
                        isDisabled={isSubmitting}
                      >
                        {isSubmitting
                          ? t("ui.buttons.saving", "Saving...")
                          : t("ui.buttons.save", "Save")}
                      </Button>
                    </Inline>
                  </FormFooter>
                </Stack>
              </Form>
            </Box>
          ) : null}{" "}
          {/* --- SYNC SECTION --- */}
          <ProjectAdminSync
            projectId={projectId}
            projectKey={projectKey}
            isLoading={isLoading}
            licenseActive={licenseActive}
            agentReplyCountSettings={agentReplyCountSettings}
            lastCommentAgentResponseSettings={lastCommentAgentResponseSettings}
            lastAgentResponseDateSettings={lastAgentResponseDateSettings}
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
