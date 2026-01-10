import { useEffect, useState, useCallback } from 'react';
import {
  Upload,
  FileText,
  FileType,
  Trash2,
  Loader2,
  Search,
  File,
  BookOpen,
  ArrowLeft,
  FolderOpen,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/sonner';
import { documentApi, type Document } from '@/services/document';
import { courseApi, type Course } from '@/services/course';

// 文件类型图标
const FileIcon = ({ type }: { type: string }) => {
  const icons: Record<string, typeof FileText> = {
    pdf: FileType,
    docx: FileText,
    doc: FileText,
    md: FileText,
    pptx: File,
  };
  const Icon = icons[type.toLowerCase()] || FileText;
  return <Icon className="w-5 h-5" />;
};

export function KnowledgeBasePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentCounts, setDocumentCounts] = useState<Record<number, number>>({});
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // 加载课程列表
  const loadCourses = async () => {
    try {
      setIsLoadingCourses(true);
      const response = await courseApi.list();
      setCourses(response.data.courses);
      
      // 加载每个课程的文档数量
      const counts: Record<number, number> = {};
      await Promise.all(
        response.data.courses.map(async (course) => {
          try {
            const docResponse = await documentApi.list(course.id);
            counts[course.id] = docResponse.data.total;
          } catch {
            counts[course.id] = 0;
          }
        })
      );
      setDocumentCounts(counts);
    } catch (error) {
      toast.error('加载课程列表失败');
      console.error(error);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // 加载文档列表
  const loadDocuments = useCallback(async () => {
    if (!selectedCourse) return;
    try {
      setIsLoading(true);
      const response = await documentApi.list(selectedCourse.id);
      setDocuments(response.data.documents);
    } catch (error) {
      toast.error('加载文档列表失败');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCourse]);

  // 上传文件
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedCourse) return;

    const file = files[0];
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md')) {
      toast.error('不支持的文件类型，请上传 PDF、Word、Markdown 或 PPT 文件');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(10);

      // 模拟上传进度
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      await documentApi.upload(selectedCourse.id, file);

      clearInterval(progressInterval);
      setUploadProgress(100);
      toast.success('文件上传成功');
      await loadDocuments();
      // 更新文档计数
      setDocumentCounts(prev => ({
        ...prev,
        [selectedCourse.id]: (prev[selectedCourse.id] || 0) + 1
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // 清空 input
      event.target.value = '';
    }
  };

  // 删除文档
  const handleDelete = async (documentId: number, fileName: string) => {
    if (!confirm(`确定要删除「${fileName}」吗？相关的知识块也会被删除。`)) {
      return;
    }

    try {
      await documentApi.delete(documentId);
      toast.success('文档已删除');
      await loadDocuments();
      // 更新文档计数
      if (selectedCourse) {
        setDocumentCounts(prev => ({
          ...prev,
          [selectedCourse.id]: Math.max((prev[selectedCourse.id] || 0) - 1, 0)
        }));
      }
    } catch (error) {
      toast.error('删除失败');
      console.error(error);
    }
  };

  // 选择课程
  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    setSearchQuery('');
  };

  // 返回课程列表
  const handleBack = () => {
    setSelectedCourse(null);
    setDocuments([]);
    setSearchQuery('');
  };

  // 过滤文档
  const filteredDocuments = documents.filter((doc) =>
    doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      loadDocuments();
    }
  }, [selectedCourse, loadDocuments]);

  if (isLoadingCourses) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">知识库管理</h1>
          <p className="text-muted-foreground">上传和管理课程文档，系统会自动进行知识切片</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">请先在仪表盘创建课程</p>
            <Button variant="outline" onClick={() => window.location.href = '/teacher'}>
              前往创建课程
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 课程详情页面 - 文档管理
  if (selectedCourse) {
    return (
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{selectedCourse.name}</h1>
            <p className="text-muted-foreground">管理该课程的知识库文档</p>
          </div>
        </div>

        {/* Upload Area */}
        <Card>
          <CardContent className="pt-6">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".pdf,.docx,.doc,.md,.pptx"
                onChange={handleUpload}
                disabled={isUploading}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-1">
                  {isUploading ? '上传中...' : '点击或拖放文件上传'}
                </p>
                <p className="text-sm text-muted-foreground">
                  支持 PDF、Word、Markdown、PPT 格式，最大 200MB
                </p>
              </label>
              {isUploading && (
                <div className="mt-4 max-w-xs mx-auto">
                  <Progress value={uploadProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground mt-2">{uploadProgress}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Document List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">文档列表</CardTitle>
                <CardDescription>{documents.length} 个文档</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索文档..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {documents.length === 0 ? '暂无文档，请上传' : '没有匹配的文档'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileIcon type={doc.file_type} />
                        </div>
                        <div>
                          <p className="font-medium">{doc.original_filename}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{doc.chunk_count} 个知识块</span>
                            <span>•</span>
                            <span>
                              {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            doc.status === 'completed'
                              ? 'success'
                              : doc.status === 'processing'
                              ? 'warning'
                              : 'destructive'
                          }
                        >
                          {doc.status === 'completed'
                            ? '已处理'
                            : doc.status === 'processing'
                            ? '处理中'
                            : '失败'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(doc.id, doc.original_filename)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 课程卡片墙
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">知识库管理</h1>
        <p className="text-muted-foreground">选择课程管理知识库文档</p>
      </div>

      {/* Course Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <Card
            key={course.id}
            className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50"
            onClick={() => handleSelectCourse(course)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="outline">{course.invite_code}</Badge>
              </div>
              <CardTitle className="mt-4">{course.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {course.description || '暂无描述'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>{documentCounts[course.id] || 0} 个文档</span>
                </div>
                <span className="text-muted-foreground">
                  {new Date(course.created_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
