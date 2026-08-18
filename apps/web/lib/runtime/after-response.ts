import { after } from "next/server";

export function scheduleAfterResponse(task: () => Promise<unknown>) {
  after(task);
}
