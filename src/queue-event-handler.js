import { Queue } from "@forge/events";
import { syncQueueConsumer } from "./resolvers/sync-logic.js";

const syncQueue = new Queue({ key: "flowzira-sync-queue" });

export async function enqueueBatches(events) {
  // Push all batch events to the queue
  for (const [payload, settings] of events) {
    try {
      // Validate payload can be serialized
      const payloadString = JSON.stringify(payload);

      // Check payload size - Forge has limits on event size
      if (payloadString.length > 64000) {
        // 64KB limit (conservative)
        throw new Error(
          `Payload too large: ${payloadString.length} characters`
        );
      }

      // Use the syncQueue to enqueue each batch - simplified approach
      await syncQueue.push(payload);
    } catch (error) {
      console.error(`[enqueueBatches] Failed to push event:`, {
        error: error.message,
        payload: payload,
        payloadType: typeof payload,
        payloadKeys: payload ? Object.keys(payload) : "null",
      });
      throw error;
    }
  }
}

// Export the consumer function for the manifest
export { syncQueueConsumer };
