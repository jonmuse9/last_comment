export const links = [
  {
    name: "SUPPORT",
    href: "https://onamus.atlassian.net/servicedesk/customer/portal/1",
  },
  {
    name: "DOCUMENTATION",
    href: "https://onamus.atlassian.net/wiki/spaces/SMCF/overview",
  },
  {
    name: "REVIEW",
    href: "https://onamus.atlassian.net/wiki/spaces/SMCF/overview",
  },
];

export const getLink = (name) => {
  return links.find((link) => link.name === name)?.href;
};
