import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加 Authorization header
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：处理 token 续期和错误
api.interceptors.response.use(
  (response) => {
    // 检查响应头中是否有新 token
    const newToken = response.headers['x-new-token'];
    if (newToken) {
      localStorage.setItem('token', newToken);
      // 同步更新 zustand store（如果存在）
      try {
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
          const parsed = JSON.parse(authStorage);
          if (parsed.state) {
            parsed.state.token = newToken;
            localStorage.setItem('auth-storage', JSON.stringify(parsed));
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
    return response;
  },
  (error: AxiosError<{ detail?: string }>) => {
    if (error.response) {
      const { status, data } = error.response;
      
      // 401: 未授权，清除认证状态并跳转登录
      if (status === 401) {
        // 清除 localStorage 中的 token
        localStorage.removeItem('token');
        // 清除 zustand 持久化状态
        localStorage.removeItem('auth-storage');
        // 使用 window.location 确保完全刷新，避免状态不一致
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
      
      // 返回错误信息
      const message = data?.detail || '请求失败';
      return Promise.reject(new Error(message));
    }
    
    return Promise.reject(new Error('网络错误，请稍后重试'));
  }
);

export default api;

// API 响应类型
export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

