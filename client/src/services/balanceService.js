import api from "./api";

export const getMyBalance = () => api.get("/leave/balances").then((res) => res.data);
