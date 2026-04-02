/**
 * Helper to call the TrafficControl DO's storage API.
 */
export async function doStorage(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  action: string,
  data: Record<string, any> = {},
): Promise<any> {
  const id = TRAFFIC_CONTROL.idFromName("global");
  const obj = TRAFFIC_CONTROL.get(id);
  const res = await obj.fetch("http://do/storage", {
    method: "POST",
    body: JSON.stringify({ action, ...data }),
  });
  return res.json();
}

/**
 * Execute a SQL SELECT query through the DO and return results.
 */
export async function doQuery(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  sql: string,
  params: any[] = [],
): Promise<any[]> {
  const result = await doStorage(TRAFFIC_CONTROL, "query", { sql, params });
  return result.results || [];
}

/**
 * Execute a SQL write (INSERT/UPDATE/DELETE) through the DO.
 */
export async function doExec(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  sql: string,
  params: any[] = [],
): Promise<void> {
  await doStorage(TRAFFIC_CONTROL, "exec", { sql, params });
}
