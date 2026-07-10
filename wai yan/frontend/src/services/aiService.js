import api from './api';

export const getBalanceSummary = async () => {
  const res = await api.get('/api/ai/balance-summary');
  return res.data.data;
};

export const explainLeaveStatus = async (payload) => {
  const res = await api.post('/api/ai/explain-status', payload);
  return res.data.data;
};

export const draftApproverNote = async (leave, action = 'approve') => {
  const res = await api.post('/api/ai/draft-note', { leave, action });
  return res.data.data;
};

export const parseNaturalLanguageLeave = async (text) => {
  const res = await api.post('/api/ai/parse-leave', { text });
  return res.data.data;
};

export const getCoverageBrief = async (params = {}) => {
  const res = await api.get('/api/ai/coverage-brief', { params });
  return res.data.data;
};

export const getLeaveTips = async (body = {}) => {
  const res = await api.post('/api/ai/leave-tips', body);
  return res.data.data;
};

export const askPolicyQuestion = async (question) => {
  const res = await api.post('/api/ai/policy-qa', { question });
  return res.data.data;
};

export const improveRemarks = async (remarks) => {
  const res = await api.post('/api/ai/improve-remarks', { remarks });
  return res.data.data;
};
