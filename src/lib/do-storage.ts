/**
 * Get the TrafficControl DO stub (RPC interface).
 */
function getStub(TRAFFIC_CONTROL: DurableObjectNamespace): any {
  const id = TRAFFIC_CONTROL.idFromName("global");
  return TRAFFIC_CONTROL.get(id);
}

/**
 * Execute a SQL SELECT query through the DO and return results.
 */
export async function doQuery(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  sql: string,
  params: any[] = [],
): Promise<any[]> {
  return getStub(TRAFFIC_CONTROL).query(sql, params);
}

/**
 * Execute a SQL write (INSERT/UPDATE/DELETE) through the DO.
 */
export async function doExec(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  sql: string,
  params: any[] = [],
): Promise<void> {
  await getStub(TRAFFIC_CONTROL).exec(sql, params);
}

export async function doGetIdentity(
  TRAFFIC_CONTROL: DurableObjectNamespace,
): Promise<{ public: string | null; private: string | null }> {
  return getStub(TRAFFIC_CONTROL).getIdentity();
}

export async function doSetIdentity(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  publicKey: string,
  privateKey: string,
): Promise<void> {
  await getStub(TRAFFIC_CONTROL).setIdentity(publicKey, privateKey);
}

export async function doSavePlan(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  planId: string,
  data: string,
): Promise<void> {
  await getStub(TRAFFIC_CONTROL).savePlan(planId, data);
}

export async function doGetPlan(
  TRAFFIC_CONTROL: DurableObjectNamespace,
  planId: string,
): Promise<string | null> {
  return getStub(TRAFFIC_CONTROL).getPlan(planId);
}
