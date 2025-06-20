import React, { useState, useEffect } from "react";
import ForgeReconciler, {
  Box,
  Stack,
  Inline,
  xcss,
  Heading,
  Text,
  Link,
  useTranslation,
  I18nProvider,
} from "@forge/react";
import { view } from "@forge/bridge";
import boxBorderStyle from "./components/seeBorders";
import { getLink } from "./components/staticInfo";
import LogoWithLinks from "../../flowzira_resources/components/logoWithLinks";

const textColor = "color.text.subtle"; // Default text color for the page

const boxStylesBase = {
  borderColor: "color.border",
  borderStyle: "solid",
  borderRadius: "border.radius",
  borderWidth: "border.width",
};

const featureCardStyles = xcss({
  ...boxStylesBase,
  minHeight: "150px",
  minWidth: "300px",
  maxWidth: "450px",
  padding: "space.200",
  flexGrow: "1.5",
  backgroundColor: "elevation.surface",
  ...boxBorderStyle,
});

const callOutBoxStyle = xcss({
  borderRadius: "border.radius",
  backgroundColor: "color.background.accent.gray.bolder.pressed",
  flexGrow: "1.5",
  ...boxBorderStyle,
});

const helpCardStyles = xcss({
  ...boxStylesBase,
  backgroundColor: "color.background.accent.gray.subtlest",
  minHeight: "275px",
  borderRadius: "border.radius",
  padding: "space.300",
  maxWidth: "400px",
  ...boxBorderStyle,
});

const GettingStartedContent = () => {
  const { ready, t } = useTranslation();
  const [context, setContext] = useState(null);

  if (!ready) {
    return null; // Wait for translations to load
  }
  useEffect(() => {
    const fetchContext = async () => {
      const context = await view.getContext();
      setContext(context);
    };

    fetchContext();
  }, []);

  return (
    <Stack space="space.400" grow="fill">
      {/* Logo */}
      <Inline alignInline="center">
        <Box
          ali
          xcss={xcss({
            flexGrow: 0.75,
            ...boxBorderStyle,
          })}
        >
          <Stack space="space.300" grow="fill">
            <Stack space="space.200" grow="fill" alignInline="center">
              <Box xcss={boxBorderStyle}>
                {" "}
                <Heading size="xxlarge" align="center">
                  {t(
                    "gettingStarted.heading",
                    "A comprehensive set of comment analytics and insights for Jira"
                  )}
                </Heading>
              </Box>{" "}
              <Text align="center" color={textColor}>
                {t(
                  "gettingStarted.description",
                  "Flowzira provides powerful, no-code custom fields and analytics to help you and your team understand and manage conversations in Jira issues. Get up and running in no time—no code required!"
                )}
              </Text>
              {/* Feature cards */}
              <Box paddingBlock="space.200" xcss={boxBorderStyle}>
                <Inline space="space.400" alignInline="center" grow="fill">
                  <Box xcss={featureCardStyles}>
                    <Stack space="space.200" alignInline="center" grow="fill">
                      {" "}
                      <Heading size="medium">
                        {t("gettingStarted.features.simple.title", "Simple")}
                      </Heading>
                      <Text align="center" color={textColor}>
                        {t(
                          "gettingStarted.features.simple.description",
                          "Effortlessly generate custom, calculated fields without any coding required."
                        )}
                      </Text>
                    </Stack>
                  </Box>
                  <Box xcss={featureCardStyles}>
                    <Stack space="space.200" alignInline="center" grow="fill">
                      {" "}
                      <Heading size="medium">
                        {t(
                          "gettingStarted.features.commentAnalytics.title",
                          "Comment Analytics"
                        )}
                      </Heading>
                      <Text align="center" color={textColor}>
                        {t(
                          "gettingStarted.features.commentAnalytics.description",
                          "Create various calculated fields to improve visibility and make issues more searchable. Fields are updated automatically!"
                        )}
                      </Text>
                    </Stack>
                  </Box>
                  <Box xcss={featureCardStyles}>
                    <Stack space="space.200" alignInline="center" grow="fill">
                      {" "}
                      <Heading size="medium">
                        {t(
                          "gettingStarted.features.dynamicInsights.title",
                          "Dynamic Insights"
                        )}
                      </Heading>
                      <Text align="center" color={textColor}>
                        {t(
                          "gettingStarted.features.dynamicInsights.description",
                          "Custom field values are always up-to-date, so your searches and reports are accurate and actionable."
                        )}
                      </Text>
                    </Stack>
                  </Box>
                </Inline>
              </Box>
            </Stack>
            <Box padding="space.500" xcss={callOutBoxStyle}>
              <Stack space="space.400" alignInline="center">
                {" "}
                <Heading size="xxlarge" color="color.text.inverse">
                  {t("gettingStarted.support.title", "We are here to help")}
                </Heading>
                <Inline space="space.400" alignInline="center">
                  <Box xcss={xcss({ ...helpCardStyles, ...boxBorderStyle })}>
                    <Stack space="space.400">
                      {" "}
                      <Heading size="large">
                        {t(
                          "gettingStarted.support.resourcesTitle",
                          "Support and Resources"
                        )}
                      </Heading>
                      <Text color={textColor}>
                        {t(
                          "gettingStarted.support.resourcesDescription",
                          "Check out these resources that will guide you through the simple process of setting up comment analytics and custom fields."
                        )}
                      </Text>
                      <Box xcss={boxBorderStyle}>
                        <Stack space="space.050" alignInline="start">
                          <Link
                            href="https://flowzira.com/support"
                            appearance="subtle"
                            target="_blank"
                          >
                            {" "}
                            <Text weight="bold">
                              {t(
                                "gettingStarted.support.supportRequest",
                                "Support Request"
                              )}
                            </Text>
                          </Link>
                          <Link
                            href="https://flowzira.com/docs"
                            appearance="subtle"
                            target="_blank"
                          >
                            <Text weight="bold">
                              {t(
                                "gettingStarted.support.userGuide",
                                "User Guide"
                              )}
                            </Text>
                          </Link>
                        </Stack>
                      </Box>
                    </Stack>
                  </Box>
                  <Box xcss={helpCardStyles}>
                    <Stack space="space.400">
                      {" "}
                      <Heading size="large">
                        {t(
                          "gettingStarted.feedback.title",
                          "Let us know what you think"
                        )}
                      </Heading>
                      <Text color={textColor}>
                        {t(
                          "gettingStarted.feedback.description",
                          "If you found Flowzira helpful, let us know! We welcome your feedback."
                        )}
                      </Text>
                      <Box xcss={boxBorderStyle}>
                        <Link
                          href="https://marketplace.atlassian.com/apps/123456/flowzira/reviews"
                          appearance="subtle"
                          target="_blank"
                        >
                          <Text weight="bold">
                            {t(
                              "gettingStarted.feedback.writeReview",
                              "Write a review"
                            )}
                          </Text>
                        </Link>
                      </Box>
                    </Stack>
                  </Box>
                </Inline>
              </Stack>
            </Box>
          </Stack>
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
    </Stack>
  );
};

// Wrapper component with I18nProvider
const GettingStarted = () => {
  return (
    <I18nProvider>
      <GettingStartedContent />
    </I18nProvider>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <GettingStarted />
  </React.StrictMode>
);
