import api from './api';


/** 单个配置项 */
export interface ConfigItem {
  key: string;
  value: string;
  label: string;
  type: 'string' | 'integer' | 'password' | 'json';
  description: string;
}

/** Agent 信息（能力描述） */
export interface AgentInfo {
  name: string;
  description: string;
}

/** 配置分组（包含分组名称和配置项列表） */
export interface ConfigGroup {
  label: string;
  description?: string;
  agent_info?: Record<string, AgentInfo>;
  items: ConfigItem[];
}

/** 获取配置的响应 */
export interface ConfigResponse {
  groups: Record<string, ConfigGroup>;
}

/** 更新配置的响应 */
export interface ConfigUpdateResponse {
  message: string;
  changed_keys: string[];
  revectorize_triggered: boolean;
}

/** 审计日志条目 */
export interface AuditLogEntry {
  id: number;
  admin_id: number;
  admin_username: string;
  config_key: string;
  old_value: string | null;
  new_value: string;
  created_at: string;
}

/** 审计日志分页响应 */
export interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
  skip: number;
  limit: number;
}

export const configApi = {
  /** 获取所有系统配置（按分组） */
  getAll: () =>
    api.get<ConfigResponse>('/admin/config'),

  /** 批量更新配置 */
  update: (configs: Record<string, string>) =>
    api.put<ConfigUpdateResponse>('/admin/config', { configs }),

  /** 获取配置变更审计日志 */
  getAuditLogs: (skip = 0, limit = 50) =>
    api.get<AuditLogResponse>('/admin/config/audit-logs', {
      params: { skip, limit },
    }),
};
