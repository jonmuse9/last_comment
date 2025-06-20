import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { storage } from "@forge/api";

const resolver = new Resolver();

resolver.define("getLicenseStatus", async () => {
  try {
    const storedLicenseStatus = await storage.get("licenseStatus");
    return storedLicenseStatus;
  } catch (error) {
    console.error("Error getting license status:", error);
    return null;
  }
});

resolver.define("storeLicenseStatus", async (payload) => {
  try {
    const { licenseActive } = payload.payload; // Correctly access the nested licenseActive
    const value = { active: licenseActive.active }; // Ensure value is provided
    await storage.set("licenseStatus", value);
    return true;
  } catch (error) {
    console.error("Error setting license status:", error);
    return null;
  }
});

export const fieldHandler = resolver.getDefinitions();
