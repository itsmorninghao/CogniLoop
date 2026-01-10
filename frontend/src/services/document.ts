import api from './api';

// 类型定义
export interface Document {
  id: number;
  filename: string;
  original_filename: string;
  file_type: string;
  course_id: number;
  subject: string | null;
  chapter_id: number | null;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}

export interface KnowledgeChunk {
  id: number;
  content: string;
  chunk_index: number;
  subject: string | null;
  chapter_id: number | null;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

// 文档 API
export const documentApi = {
  // 上传文档
  upload: (courseId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('course_id', String(courseId));
    return api.post<Document>('/document/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  // 获取文档列表
  list: (courseId: number) =>
    api.get<DocumentListResponse>('/document/list', {
      params: { course_id: courseId },
    }),

  // 删除文档
  delete: (documentId: number) =>
    api.delete(`/document/${documentId}`),

  // 获取文档知识块
  getChunks: (documentId: number) =>
    api.get<KnowledgeChunk[]>(`/document/${documentId}/chunks`),
};

