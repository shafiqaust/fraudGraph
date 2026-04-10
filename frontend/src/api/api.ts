import axios from 'axios'

const api = axios.create({ baseURL: '', timeout: 30000 })

export interface TriggeredRule { id: string; label: string; weight: number }

export interface Transaction {
  tx_id: string; step: number; type: string; amount: number
  nameOrig: string; nameDest: string
  oldbalanceOrg: number; newbalanceOrig: number
  oldbalanceDest: number; newbalanceDest: number
  isFraud: number; isFlaggedFraud: number
  ml_score: number; rule_score: number; risk_score: number
  risk_level: 'High' | 'Medium' | 'Low'
  triggered_rules: TriggeredRule[]
  explanation: string
}

export interface StatsResponse {
  total_rows: number; fraud_count: number; flagged_count: number
  type_counts: Record<string, number>; total_amount: number
  avg_amount: number; max_amount: number
  high_risk_count: number; medium_risk_count: number; low_risk_count: number
}

export interface GraphNode {
  id: string; label: string
  type: 'account' | 'merchant' | 'unknown'
  base_risk: number; propagated_risk: number; level: number
}

export interface GraphEdge {
  source: string; target: string; amount: number
  type: string; tx_id: string; weight: number; is_fraud: number
}

export interface MAPFStepContext {
  step: number; from: string; to: string; type: string
  amount: number; isFraud: number
  highlight: 'competitor' | 'center' | 'fraud' | 'normal'
}

export interface MAPFConflictDetail {
  competitor_account: string; center_account: string
  destination: string; tx_type: string
  competitor_amount: number; competitor_step: number
  center_step: number; step_difference: number; window: number
  step_context: MAPFStepContext[]; competitor_is_fraud: number
}

export interface GraphResponse {
  center: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  mapf_conflicts: string[]
  mapf_details: MAPFConflictDetail[]
  mapf_explanation: string
  stats: { node_count: number; edge_count: number; conflict_count: number }
}

export const fetchStats = async (): Promise<StatsResponse> =>
  (await api.get<StatsResponse>('/api/stats')).data

export const fetchTransactions = async (params?: {
  risk_level?: string; tx_type?: string; min_amount?: number
  limit?: number; sort_by?: string
}): Promise<{ transactions: Transaction[]; total: number }> =>
  (await api.get('/api/transactions', { params })).data

export const fetchGraph = async (entity_id: string, depth = 2): Promise<GraphResponse> =>
  (await api.get<GraphResponse>('/api/graph', { params: { entity_id, depth } })).data

export default api
