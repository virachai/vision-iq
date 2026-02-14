import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage<Map<string, any>>();

export const CORRELATION_ID_KEY = "correlationId";

export function getCorrelationId(): string | undefined {
  const store = requestContext.getStore();
  return store?.get(CORRELATION_ID_KEY);
}
