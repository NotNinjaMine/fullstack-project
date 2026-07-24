// UC-20: bulk yearly entitlement update & new-joiner pro-ration.
import api from "./api";

export const listPolicies = () => api.get("/admin/policies").then((res) => res.data);

export const previewBulkEntitlement = (year) =>
  api.get(`/admin/entitlement/preview?year=${year}`).then((res) => res.data);

export const commitBulkEntitlement = (year) =>
  api.post("/admin/entitlement/commit", { year }).then((res) => res.data);

export const prorateEntitlementPreview = (fullEntitlement, startDate) =>
  api
    .post("/admin/entitlement/prorate", { fullEntitlement, startDate })
    .then((res) => res.data);
