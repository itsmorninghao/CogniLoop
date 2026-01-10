import { Link, useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  ArrowRight,
  ChevronDown,
  FileText,
  Brain,
  CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { useEffect, useRef, useState, useCallback } from 'react';

export function HomePage() {
  const { isAuthenticated, userType, token } = useAuthStore();
  const navigate = useNavigate();
  const hasNavigated = useRef(false);
  
  // 页面引用
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  
  // 当前页面索引和滚动锁定状态
  const [currentPage, setCurrentPage] = useState(0);
  const isScrolling = useRef(false);
  const pages = [heroRef, featuresRef, ctaRef];

  // 如果已登录且有有效 token，直接跳转到对应的仪表盘
  useEffect(() => {
    if (isAuthenticated && token && !hasNavigated.current) {
      hasNavigated.current = true;
      navigate(userType === 'teacher' ? '/teacher' : '/student', { replace: true });
    }
  }, [isAuthenticated, userType, token, navigate]);

  // 滚动到指定页面
  const scrollToPage = useCallback((pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= pages.length) return;
    if (isScrolling.current) return;
    
    isScrolling.current = true;
    setCurrentPage(pageIndex);
    
    pages[pageIndex].current?.scrollIntoView({ behavior: 'smooth' });
    
    // 滚动动画完成后解锁（约 800ms）
    setTimeout(() => {
      isScrolling.current = false;
    }, 800);
  }, [pages]);

  // 处理滚轮事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      if (isScrolling.current) return;
      
      // 判断滚动方向
      if (e.deltaY > 0) {
        // 向下滚动
        scrollToPage(currentPage + 1);
      } else if (e.deltaY < 0) {
        // 向上滚动
        scrollToPage(currentPage - 1);
      }
    };

    // 处理键盘事件（上下箭头、Page Up/Down）
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isScrolling.current) return;
      
      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          scrollToPage(currentPage + 1);
          break;
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          scrollToPage(currentPage - 1);
          break;
        case 'Home':
          e.preventDefault();
          scrollToPage(0);
          break;
        case 'End':
          e.preventDefault();
          scrollToPage(pages.length - 1);
          break;
      }
    };

    // 处理触摸事件（移动端）
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isScrolling.current) return;
      
      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartY - touchEndY;
      
      // 滑动距离超过 50px 才触发
      if (Math.abs(deltaY) > 50) {
        if (deltaY > 0) {
          scrollToPage(currentPage + 1);
        } else {
          scrollToPage(currentPage - 1);
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentPage, scrollToPage, pages.length]);

  const scrollToFeatures = () => {
    scrollToPage(1);
  };

  return (
    <div 
      ref={containerRef}
      className="h-screen overflow-hidden"
    >
      {/* 页面指示器 */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            onClick={() => scrollToPage(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              currentPage === i 
                ? 'bg-primary scale-125' 
                : 'bg-slate-300 hover:bg-slate-400'
            }`}
            aria-label={`跳转到第 ${i + 1} 页`}
          />
        ))}
      </div>

      {/* ==================== Page 1: Hero Section ==================== */}
      <section 
        ref={heroRef}
        className="relative h-screen flex flex-col overflow-hidden"
      >
        {/* 背景层 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50" />
        
        {/* 装饰性背景元素 */}
        <div className="absolute inset-0 overflow-hidden">
          {/* 大圆形渐变 */}
          <div className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] rounded-full bg-gradient-to-br from-primary/10 to-primary/5 blur-3xl" />
          <div className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-indigo-200/30 to-blue-100/20 blur-3xl" />
          
          {/* 网格背景 */}
          <div 
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: `
                linear-gradient(to right, #000 1px, transparent 1px),
                linear-gradient(to bottom, #000 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />
          
          {/* 浮动装饰元素 */}
          <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-primary/40 animate-pulse" />
          <div className="absolute top-1/3 right-1/3 w-3 h-3 rounded-full bg-indigo-400/30 animate-pulse" />
          <div className="absolute bottom-1/3 left-1/3 w-2 h-2 rounded-full bg-blue-400/40 animate-pulse" />
        </div>

        {/* 主内容 - 居中 */}
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="container mx-auto px-6 text-center">
            {/* Logo */}
            <div className="mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white shadow-xl shadow-primary/10 mb-6">
                <GraduationCap className="w-10 h-10 text-primary" />
              </div>
            </div>

            {/* 标题 */}
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
              <span className="bg-gradient-to-r from-primary via-indigo-600 to-primary bg-clip-text text-transparent">
                Cogni
              </span>
              <span className="text-slate-800">Loop</span>
            </h1>

            {/* 副标题 */}
            <p className="text-xl md:text-2xl text-slate-600 font-light mb-4 max-w-2xl mx-auto">
              智能教育，让知识传递更高效
            </p>
            <p className="text-base md:text-lg text-slate-500 max-w-xl mx-auto mb-12">
              基于 AI 技术的试题生成与智能批改系统
            </p>

            {/* 按钮组 */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/login">
                <Button 
                  size="lg" 
                  className="w-40 h-14 text-lg rounded-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 gap-2"
                >
                  立即体验
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                onClick={scrollToFeatures}
                className="w-40 h-14 text-lg rounded-full border-2 hover:bg-slate-50 transition-all duration-300"
              >
                了解更多
              </Button>
            </div>
          </div>
        </div>

        {/* 向下滚动提示 - 固定在底部 */}
        <div className="relative z-10 pb-8">
          <button
            onClick={scrollToFeatures}
            className="mx-auto flex flex-col items-center gap-2 text-slate-400 hover:text-primary transition-colors cursor-pointer"
          >
            <span className="text-sm">向下滚动</span>
            <ChevronDown className="w-5 h-5 animate-bounce" />
          </button>
        </div>
      </section>

      {/* ==================== Page 2: Features + Stats ==================== */}
      <section ref={featuresRef} className="h-screen flex flex-col">
        {/* 功能区域 */}
        <div className="flex-1 bg-white flex items-center">
          <div className="container mx-auto px-6">
            {/* 标题 */}
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4">
                核心功能
              </h2>
              <p className="text-lg text-slate-500 max-w-lg mx-auto">
                利用人工智能技术，重新定义教与学的体验
              </p>
            </div>

            {/* 功能卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* 智能知识库 */}
              <div className="group p-6 rounded-2xl bg-gradient-to-b from-blue-50/50 to-white border border-blue-100/50 hover:shadow-xl hover:shadow-blue-100/50 transition-all duration-500">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">智能知识库</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  上传 PDF、Word、PPT 等课程资料，系统自动进行知识切片和语义向量化
                </p>
              </div>

              {/* AI 出题 */}
              <div className="group p-6 rounded-2xl bg-gradient-to-b from-purple-50/50 to-white border border-purple-100/50 hover:shadow-xl hover:shadow-purple-100/50 transition-all duration-500">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Brain className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">AI 智能出题</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  使用自然语言描述需求，AI 根据知识库内容智能生成各类试题
                </p>
              </div>

              {/* 智能批改 */}
              <div className="group p-6 rounded-2xl bg-gradient-to-b from-emerald-50/50 to-white border border-emerald-100/50 hover:shadow-xl hover:shadow-emerald-100/50 transition-all duration-500">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <CheckCircle className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">智能批改</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  客观题自动批改，主观题 AI 语义分析打分，即时反馈详细解析
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 数据统计区域 */}
        <div className="bg-gradient-to-r from-primary via-indigo-600 to-primary py-16">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
              {[
                { value: 'AI', label: '智能驱动' },
                { value: 'RAG', label: '检索增强' },
                { value: '100%', label: '自动批改' },
                { value: '∞', label: '无限可能' },
              ].map((stat, i) => (
                <div key={i}>
                  <div className="text-3xl md:text-4xl font-bold text-white mb-1">{stat.value}</div>
                  <div className="text-sm text-white/70">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== Page 3: CTA + Footer ==================== */}
      <section ref={ctaRef} className="h-screen flex flex-col">
        {/* CTA 区域 */}
        <div className="flex-1 bg-white flex items-center justify-center">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-800 mb-6">
              准备好开始了吗？
            </h2>
            <p className="text-lg text-slate-500 mb-10 max-w-lg mx-auto">
              立即注册，体验 AI 驱动的智能教育平台
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register">
                <Button 
                  size="lg" 
                  className="w-40 h-14 text-lg rounded-full shadow-lg shadow-primary/25 hover:shadow-xl transition-all duration-300"
                >
                  免费注册
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-40 h-14 text-lg rounded-full border-2 transition-all duration-300"
                >
                  立即登录
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-slate-900 py-8">
          <div className="container mx-auto px-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-semibold text-white">CogniLoop</span>
              </div>
              <p className="text-slate-400 text-sm">
                © 2026 CogniLoop. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </section>
    </div>
  );
}
