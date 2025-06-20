// Event handler for comment events
import { getFlowziraCustomFields } from "./sync-helpers.js";
import { calculateFieldValue } from "./sync-logic.js";

export async function handleCommentEvent(event, context) {
  try {
    const issue = event.issue;
    if (!issue || !issue.id || !issue.key) {
      return;
    }
    const flowziraFieldsData = await getFlowziraCustomFields();
    const flowziraFields =
      flowziraFieldsData && flowziraFieldsData.values
        ? flowziraFieldsData.values
        : [];
    for (const field of flowziraFields) {
      await calculateFieldValue(issue, field);
    }
  } catch (err) {
    throw err;
  }
}
