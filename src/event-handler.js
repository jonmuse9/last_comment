import { handleCommentEvent } from "./resolvers/admin-handler.js";
import { Queue } from "@forge/events";
import { syncQueueConsumer } from "./resolvers/sync-logic.js";

const syncQueue = new Queue({ key: "flowzira-sync-queue" });
syncQueue.process(syncQueueConsumer);

export async function run(event, context) {
  try {
    await handleCommentEvent(event, context);
    console.log("[EVENT][handleCommentEvent] Field update completed.");
  } catch (err) {
    console.error("[EVENT][handleCommentEvent][ERROR]", err);
    throw err;
  }
}
