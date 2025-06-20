import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Stack,
  Inline,
  Label,
  SectionMessage,
  Heading,
  Text,
  Textfield,
  xcss,
  Icon,
  useTranslation,
} from "@forge/react";
import { invoke, view } from "@forge/bridge";
import boxBorderStyle from "./seeBorders";

const DEFAULT_BATCH_SIZE = 100;

const ProjectAdminSync = ({
  projectId,
  projectKey,
  isLoading,
  isGlobalAdmin = false,
  licenseActive = true,
}) => {
  const { t } = useTranslation();

  const [jqlQuery, setJqlQuery] = useState("");
  const [syncState, setSyncState] = useState({
    isRunning: false,
    startTime: null,
    totalWorkItems: 0,
    processedWorkItems: 0,
    currentBatchStart: 0,
    errors: [],
    lastUpdated: null,
  });
  const [syncLog, setSyncLog] = useState([]);
  const [syncError, setSyncError] = useState(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState("");
  const [syncPolling, setSyncPolling] = useState(false);
  const [environmentType, setEnvironmentType] = useState(null);

  useEffect(() => {
    let interval;
    if (syncPolling) {
      interval = setInterval(() => {
        invoke("getSyncStatus")
          .then((status) => {
            setSyncState(status);
            if (!status.isRunning) setSyncPolling(false);
          })
          .catch((e) => {
            setSyncError(e.message);
            setSyncPolling(false);
          });
        invoke("getSyncLog")
          .then((log) => setSyncLog(log))
          .catch(() => {});
      }, 2000);
    }
    return () => interval && clearInterval(interval);
  }, [syncPolling]);

  // Fetch sync state and log immediately on load
  useEffect(() => {
    invoke("getSyncStatus")
      .then((status) => setSyncState(status))
      .catch(() => {});
    invoke("getSyncLog")
      .then((log) => setSyncLog(log))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const ctx = await view.getContext();
        setEnvironmentType(ctx?.environmentType || null);
      } catch {
        setEnvironmentType(null);
      }
    })();
  }, []);
  const handleStartSync = async () => {
    setSyncError(null);
    setSyncStatusMsg("");
    try {
      const payload = {
        batchSize: DEFAULT_BATCH_SIZE,
        jqlQuery: jqlQuery.trim() || null,
      };

      // Only include project info for non-global admin
      if (!isGlobalAdmin) {
        payload.projectId = projectId;
        payload.projectKey = projectKey;
      }
      const state = await invoke("startSync", payload);
      setSyncState(state);
      setSyncPolling(true);
      setSyncStatusMsg(t("ui.sync.status.syncStarted", "Sync started"));
      // No need to call enqueueSyncBatches here; handled by backend
    } catch (e) {
      setSyncError(e.message);
    }
  };

  const handleStopSync = async () => {
    setSyncError(null);
    setSyncStatusMsg("");
    try {
      const state = await invoke("stopSync");
      setSyncState(state);
      setSyncPolling(false);
      setSyncStatusMsg(t("ui.sync.status.syncStopped", "Sync stopped"));
    } catch (e) {
      setSyncError(e.message);
    }
  };

  const handleForceReset = async () => {
    setSyncError(null);
    setSyncStatusMsg("");
    if (
      window.confirm(
        t(
          "ui.sync.confirmations.forceReset",
          "Are you sure you want to force reset? This will clear all sync state and history."
        )
      )
    ) {
      try {
        await invoke("forceResetSync", { projectId });
        setSyncState({
          isRunning: false,
          startTime: null,
          totalWorkItems: 0,
          processedWorkItems: 0,
          currentBatchStart: 0,
          errors: [],
          lastUpdated: null,
        });
        setSyncLog([]);
        setSyncStatusMsg(
          t(
            "ui.sync.status.syncResetSuccess",
            "Sync state has been reset successfully"
          )
        );
      } catch (e) {
        setSyncError(
          `${t(
            "ui.sync.errors.failedToReset",
            "Failed to reset sync state"
          )}: ${e.message}`
        );
      }
    }
  };
  const handleJqlQueryChange = (event) => {
    setJqlQuery(event.target.value);
  };
  const percent =
    syncState.totalWorkItems > 0
      ? Math.round(
          (syncState.processedWorkItems / syncState.totalWorkItems) * 100
        )
      : 0;

  let eta = null;
  if (
    syncState.isRunning &&
    syncState.processedWorkItems > 0 &&
    syncState.startTime
  ) {
    const elapsed =
      (Date.now() - new Date(syncState.startTime).getTime()) / 1000;
    const avgPerWorkItem = elapsed / syncState.processedWorkItems;
    const remaining = syncState.totalWorkItems - syncState.processedWorkItems;
    eta = Math.round(avgPerWorkItem * remaining);
  }

  const handleForceStopAllSyncs = async () => {
    setSyncError(null);
    setSyncStatusMsg("");
    if (
      window.confirm(
        t(
          "ui.sync.confirmations.emergencyStop",
          "⚠️ EMERGENCY STOP: This will immediately stop ALL running sync processes and clear the queue. Use this only if syncs are stuck or processing duplicates. Are you sure?"
        )
      )
    ) {
      try {
        const result = await invoke("forceStopAllSyncs");
        if (result.success) {
          setSyncState({
            isRunning: false,
            startTime: null,
            totalWorkItems: 0,
            processedWorkItems: 0,
            currentBatchStart: 0,
            errors: [],
            lastUpdated: null,
          });
          setSyncLog([]);
          setSyncPolling(false);
          setSyncStatusMsg(
            t(
              "ui.sync.status.emergencyStopSuccess",
              "✅ Emergency stop completed: All syncs stopped and queue cleared"
            )
          );
        }
      } catch (e) {
        setSyncError(
          `${t(
            "ui.sync.errors.failedToForceStop",
            "Failed to force stop syncs"
          )}: ${e.message}`
        );
      }
    }
  };

  return (
    <Box
      xcss={xcss({
        width: "50%",
        marginTop: "space.300",
        marginBottom: "space.300",
        ...boxBorderStyle,
      })}
    >
      {" "}
      <Heading size="medium">
        {t("ui.sync.title", "Bulk Sync Custom Fields")}
      </Heading>
      <Text>
        {isGlobalAdmin
          ? t(
              "ui.sync.description.globalAdmin",
              "Use this tool to backfill calculated custom field values for work items across all projects. This is required if you want work items to have up-to-date values. Issues will automatically have the calculated values applied when comments are added or deleted."
            )
          : t(
              "ui.sync.description.projectAdmin",
              "Use this tool to backfill calculated custom field values for all work items in this project. This is required if you want old work items to have up-to-date values. Issues will automatically have the calculated values applied when comments are added or deleted."
            )}
      </Text>{" "}
      <Box xcss={xcss({ margin: "space.100" })}>
        {" "}
        {!licenseActive && (
          <SectionMessage appearance="error">
            <Text>
              {t(
                "ui.sync.licenseError",
                "Sync functionality is disabled due to invalid license. Please ensure your license is active to use the sync feature."
              )}
            </Text>
          </SectionMessage>
        )}{" "}
        <SectionMessage appearance="info">
          <Text>
            {isGlobalAdmin
              ? t(
                  "ui.sync.infoMessage.globalAdmin",
                  "This sync tool can only process a maximum of 5,000 work items and prioritizes the most recent work items. Use JQL queries to filter issues from specific projects or issue types."
                )
              : t(
                  "ui.sync.infoMessage.projectAdmin",
                  "This sync tool can only process a maximum of 5,000 work items and prioritizes the most recent work items. If your project has more than 5,000 work items, consider using JQL to filter the issues as needed."
                )}
          </Text>
        </SectionMessage>{" "}
      </Box>
      <Box xcss={xcss({ marginTop: "space.200", ...boxBorderStyle })}>
        <Stack space="space.100">
          <Box xcss={xcss({ marginBottom: "space.300", ...boxBorderStyle })}>
            {" "}
            <Stack space="space.100">
              {" "}
              <Label labelFor="jql-query-input">
                {isGlobalAdmin
                  ? t("ui.sync.jql.label.required", "JQL Query (required)")
                  : t("ui.sync.jql.label.optional", "JQL Query (optional)")}
              </Label>{" "}
              <Textfield
                id="jql-query-input"
                isDisabled={syncState.isRunning || !licenseActive}
                value={jqlQuery}
                onChange={handleJqlQueryChange}
                placeholder={
                  isGlobalAdmin
                    ? t(
                        "ui.sync.jql.placeholder.globalAdmin",
                        "Enter JQL query to specify which issues to sync"
                      )
                    : t(
                        "ui.sync.jql.placeholder.projectAdmin",
                        "Enter JQL query to filter issues"
                      )
                }
                elemBeforeInput={
                  <Box
                    xcss={{ marginTop: "space.050", marginLeft: "space.100" }}
                  >
                    <Icon glyph="search" />
                  </Box>
                }
              />
              <Box xcss={{ marginTop: "space.050", marginRight: "space.100" }}>
                {" "}
                <Text size="small" as="em">
                  {isGlobalAdmin
                    ? t(
                        "ui.sync.jql.helpText.globalAdmin",
                        "JQL query is required for global sync. Use project keys or other filters to specify which issues to process."
                      )
                    : t(
                        "ui.sync.jql.helpText.projectAdmin",
                        "Optional JQL query. Leave blank to process all issues in project. This filter can only be used to search for work items in this project."
                      )}
                </Text>
              </Box>
            </Stack>
          </Box>
          <Inline space="space.100" alignInline="end">
            {" "}
            <Button
              appearance="danger"
              onClick={handleStopSync}
              isDisabled={!syncState.isRunning || !licenseActive}
            >
              {t("ui.sync.buttons.stopSync", "Stop Sync")}
            </Button>
            <Button
              appearance="primary"
              onClick={handleStartSync}
              isDisabled={
                syncState.isRunning ||
                isLoading ||
                !licenseActive ||
                (isGlobalAdmin ? !jqlQuery.trim() : !projectId)
              }
            >
              {syncState.isRunning
                ? t("ui.sync.buttons.syncRunning", "Sync Running...")
                : t("ui.sync.buttons.startSync", "Start Sync")}
            </Button>
          </Inline>
        </Stack>
      </Box>
      <Box xcss={xcss({ marginTop: "space.200", ...boxBorderStyle })}>
        {syncState.isRunning && (
          <>
            <Box
              xcss={xcss({
                width: "100%",
                background: "#eee",
                height: 12,
                borderRadius: 4,
              })}
            >
              <Box
                xcss={xcss({
                  width: `${percent}%`,
                  background: percent === 100 ? "#36B37E" : "#0052CC",
                  height: 12,
                  borderRadius: 4,
                  ...boxBorderStyle,
                })}
              />
            </Box>{" "}
            <Text>
              {syncState.processedWorkItems} / {syncState.totalWorkItems}{" "}
              {t("ui.sync.progress.workItemsProcessed", "work items processed")}{" "}
              ({percent}%)
              {eta !== null && `, ${t("ui.sync.progress.eta", "ETA")}: ${eta}s`}
            </Text>
            <Text>
              {t("ui.status.status", "Status")}:{" "}
              {syncState.isRunning
                ? t("ui.sync.status.running", "Running")
                : syncState.processedWorkItems === syncState.totalWorkItems &&
                  syncState.totalWorkItems > 0
                ? t("ui.sync.status.completed", "Completed")
                : t("ui.sync.status.idle", "Idle")}
            </Text>
          </>
        )}
        {syncError && (
          <SectionMessage appearance="error">{syncError}</SectionMessage>
        )}
        {syncStatusMsg && (
          <SectionMessage appearance="info">{syncStatusMsg}</SectionMessage>
        )}
      </Box>
      <Box
        xcss={xcss({
          marginTop: "space.200",
          marginBottom: "space.500",
          ...boxBorderStyle,
        })}
      >
        {" "}
        <Text>{t("ui.sync.history.title", "Sync History:")}</Text>
        <Box
          xcss={xcss({
            maxHeight: 120,
            overflowY: "auto",
            background: "#fafbfc",
            padding: 8,
            borderRadius: 4,
            ...boxBorderStyle,
          })}
        >
          {syncLog.length === 0 && (
            <Text>
              {t("ui.sync.history.noHistory", "No sync history yet.")}
            </Text>
          )}
          {syncLog.map((entry, i) => (
            <Box key={i} xcss={xcss({ ...boxBorderStyle })}>
              <Text>
                {" "}
                {new Date(entry.timestamp).toLocaleString()} -{" "}
                {entry.type ? `Sync ${entry.type} ` : ""}
                {entry.issueKey ? ` (${entry.issueKey})` : ""}
                {entry.projectKey
                  ? `: ${t("ui.sync.history.project", "Project")}: ${
                      entry.projectKey
                    }`
                  : ""}
                {entry.projectId ? ` (${entry.projectId})` : ""}
                {entry.error ? `: ${entry.error}` : ""}
              </Text>
            </Box>
          ))}
        </Box>
        {syncState.isRunning && (
          <Box xcss={xcss({ marginTop: "space.300", ...boxBorderStyle })}>
            {" "}
            <SectionMessage appearance="warning">
              <Text>
                {t(
                  "ui.sync.warnings.timeWarning",
                  "The sync process can take over 30 minutes to complete. If the sync fails to complete, it can be reattempted after 1 hour."
                )}
              </Text>
            </SectionMessage>
          </Box>
        )}
      </Box>{" "}
      {/* Emergency and Development buttons */}
      <Inline space="space.100">
        {environmentType === "DEVELOPMENT" && (
          <>
            {" "}
            <Button
              appearance="danger"
              onClick={handleForceStopAllSyncs}
              isDisabled={!licenseActive}
            >
              {t(
                "ui.sync.buttons.forceStop",
                "🚨 Emergency Force Stop All Syncs"
              )}
            </Button>
            <Button
              appearance="danger"
              onClick={handleForceReset}
              isDisabled={syncState.isRunning || !licenseActive}
            >
              {t("ui.sync.buttons.forceReset", "Force Reset")}
            </Button>
          </>
        )}
      </Inline>
    </Box>
  );
};

export default ProjectAdminSync;
