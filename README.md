<p align="center">
  <img src="assets/GitHub_README.png" alt="CogniLoop - Intelligent Feedback & Learning System">
</p>

一个智能助教系统，教师可以上传课程相关文档，根据文档内容生成试题集，并使用大模型的能力自动批改学生答案给出评分和解析。

该项目目前正在开发阶段，后续会不断完善功能和优化体验。如果您遇到任何问题，欢迎提交 issue，我很乐意帮助您！

## 快速开始

> 启动 CogniLoop 最简单的方式是通过 Docker Compose。在运行以下命令启动 CogniLoop 之前，请确保您的机器上已安装 [Docker](https://docs.docker.com/get-started/get-docker/)和 [Docker Compose](https://docs.docker.com/compose/install/)：

> 部署遇到的任何问题，欢迎提交 issue，我会第一时间帮助您!

一、 clone 本仓库

```bash
git clone https://github.com/itsmorninghao/CogniLoop.git
cd CogniLoop
```

二、 复制并编辑环境变量文件

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置 JWT 密钥等信息（生产环境建议使用 `openssl rand -hex 32` 生成密钥）

三、 构建并启动服务

```bash
cd docker-cogniloop
docker-compose up -d --build
```

四、 首次创建超级管理员

首次访问任意地址（如 http://localhost:8000 ）时，系统会要求先创建超级管理员账户。按页面提示填写用户名、邮箱、密码等信息即可。创建完成后即可正常使用系统。

五、 配置 LLM 和 Embedding 模型

使用刚创建的管理员账号登录管理员后台 http://localhost:8000/admin/login ，在「系统配置」页面填写：

- **LLM 模型配置**：API Key、Base URL、模型名称
- **Embedding 模型配置**：API Key、Base URL、模型名称、向量维度
- **RAG 检索配置**：分块大小、分块重叠、检索数量（可保持默认值）

六、 访问应用

- 前端: http://localhost:8000
- 管理员后台: http://localhost:8000/admin/login

## 功能特性

### 教师端

- 课程管理：创建课程、生成邀请码
- 知识库管理：上传文档、自动分块、向量化存储
- 试题生成：自然语言描述生成试题集
- 数据统计：查看课程概览、试题完成率、学生成绩

### 学生端

- 加入课程：通过邀请码加入课程
- 答题系统：支持单选、多选、填空、简答题
- 智能批改：自动批改客观题，AI 批改主观题
- 成绩查看：查看批改结果和反馈

### 管理员端

- 用户管理：管理教师和学生账户
- 课程管理：查看和管理所有课程
- 系统统计：查看系统整体数据
- 管理员管理：超级管理员可管理其他管理员

## 界面展示

> 产品功能持续更新，截图可能存在一定滞后，请以实际页面为准

### 首页

现代化的落地页设计，该项目的前端构建理念:简约、大气、美观。

![首页](assets/home-landing.png)

---

### 教师端

#### 仪表盘

课程概览与数据统计，一目了然掌握教学动态。

![教师仪表盘](assets/teacher-dashboard.png)

#### 知识库管理

上传 PDF、Word、Markdown、PPT 等格式文档，系统自动分块并向量化存储。

![知识库管理](assets/teacher-knowledge-base.png)

#### 试题生成

通过自然语言描述需求，AI 自动根据知识库生成试题集。

![试题生成](assets/teacher-question-generator.png)

#### 试题预览 - 选择题

预览生成的单选题、多选题，支持查看正确答案。

![试题预览-选择题](assets/teacher-question-preview-choice.png)

#### 试题预览 - 简答题

预览简答题的参考答案与评分要点。

![试题预览-简答题](assets/teacher-question-preview-essay.png)

---

### 学生端

#### 我的课程

查看已加入的课程列表，支持通过邀请码加入新课程。

![学生课程列表](assets/student-courses.png)

#### 待做试题

统一查看所有待完成的试题，按状态分类管理。

![待做试题](assets/student-pending-tests.png)

#### 答题界面

简洁的答题体验，支持题目导航、保存草稿、提交答案。

![答题界面](assets/student-exam-single-choice.png)

#### 批改中

答案提交后系统自动进行 AI 批改，实时显示批改状态。

![批改中](assets/student-exam-grading.png)

#### 成绩查看

批改完成后查看详细成绩，包含每道题的得分与 AI 反馈。

![成绩查看](assets/student-exam-result.png)

## 技术栈

- **后端框架**: FastAPI
- **数据库**: PostgreSQL 16 + pgvector
- **AI**: LangChain + LangGraph + OpenAI
- **前端**: React + Vite + TypeScript
- **容器化**: Docker Compose

## 开发计划

- [ ] 根据答题情况生成学生画像，做到每位同学的每一套题都是个性化定制的，而不是千篇一律的
- [ ] 支持教师设置答题时间

## 许可证

MIT License
