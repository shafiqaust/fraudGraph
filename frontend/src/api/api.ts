/**
 * api/api.ts
 * ----------
 * All backend calls. Single source of truth for types + fetch logic.
 */

import axios from "axios";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const api = axios.create({ baseURL: BASE, timeout: 30_000 });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TriggeredRule {
  id:     string;
  label:  string;
  weight: number;
}

export interface Transaction {
  tx_id:           string;
  step:            number;
  type:            string;
  amount:          number;
  nameOrig:        string;
  nameDest:        string;
  oldbalanceOrg:   number;
  newbalanceOrig:  number;
  oldbalanceDest:  number;
  newbalanceDest:  number;
  isFraud:         number;
  isFlaggedFraud:  number;
  ml_score:        number;
  rule_score:      number;
  risk_score:      number;
  risk_level:      "High" | "Medium" | "Low";
  triggered_rules: TriggeredRule[];
  explanation:     string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  total:        number;
  offset:       number;
  limit:        number;
}

export interface StatsResponse {
  total_rows:        number;
  fraud_count:       number;
  flagged_count:     number;
  type_counts:       Record<string, number>;
  total_amount:      number;
  avg_amount:        number;
  max_amount:        number;
  high_risk_count:   number;
  medium_risk_count: number;
  low_risk_count:    number;
}

export interface GraphNode {
  id:              string;
  label:           string;
  type:            "account" | "merchant" | "unknown";
  base_risk:       number;
  propagated_risk: number;
  level:           number;
}

export interface GraphEdge {
  source:   string;
  target:   string;
  amount:   number;
  type:     string;
  tx_id:    string;
  weight:   number;
  is_fraud: number;
}

export interface GraphResponse {
  center:            string;
  nodes:             GraphNode[];
  edges:             GraphEdge[];
  mapf_conflicts:    string[];
  mapf_explanation:  string;
  stats: {
    node_count:     number;
    edge_count:     number;
    conflict_count: number;
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const fetchStats = async (): Promise<StatsResponse> => {
  const { data } = await api.get<StatsResponse>("/api/stats");
  return data;
};

export const fetchTransactions = async (params?: {
  limit?:      number;
  offset?:     number;
  risk_level?: string;
  tx_type?:    string;
  min_amount?: number;
}): Promise<TransactionsResponse> => {
  const { data } = await api.get<TransactionsResponse>("/api/transactions", { params });
  return data;
};

export const fetchTransaction = async (tx_id: string): Promise<Transaction> => {
  const { data } = await api.get<Transaction>(`/api/transaction/${tx_id}`);
  return data;
};

export const fetchGraph = async (
  entity_id: string,
  depth = 2,
): Promise<GraphResponse> => {
  const { data } = await api.get<GraphResponse>("/api/graph", {
    params: { entity_id, depth },
  });
  return data;
};

export default api;
