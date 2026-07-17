# KiwiListen: 项目可行性与架构决策评估

**日期**: 2026-07-16
**状态**: ✅ 已实现（开发完成）

---

## 一、项目现状

| 维度 | 状态 |
|------|------|
| 设计文档 | ✅ 完成 (`docs/NZ_Listener_TingJu_Adaptation.md`) |
| TingJu 源码 | ✅ 已读取全部关键文件 |
| AI Studio UI 原型 | ✅ 已读取全部 React 组件（作为参考） |
| Python Pipeline | ✅ 已实现（esl_scraper.py, aligner.py, db.py） |
| FastAPI Web 服务 | ✅ 已实现（web/app.py + Jinja2 直接渲染） |
| 前端 UI | ✅ 已实现（index.html, listen.html, player.js, kiwi.css） |
| 实际运行验证 | ✅ 所有路由 200 OK |

---

## 二、最终实现方案

**采用 Option C: 从零构建，借鉴想法。**

### 关键架构决策

1. **模板渲染**: 使用原生 `jinja2.Environment` 直接渲染，绕过 `starlette.templating.Jinja2Templates`（避免弱引用缓存键在某些环境下不可哈希的兼容性问题）
2. **Scraper 解析**: `li > a[href*="?p="]` 选择器（而非 `h2 a`），因为 ESL News NZ 文章链接在 `<li>` 中
3. **转录边界**: `<strong>News story</strong>` 和 `<strong>Answers</strong>` 可能在 `<p>` 内部（嵌套结构），需用 `find_all(["p","strong"], recursive=False)` 遍历
4. **Fuzzy 匹配**: 用 `difflib.SequenceMatcher` 将 whisper 词时戳模糊对齐到人工转录句子

### 技术栈

- **后端**: Python 3.11, FastAPI, SQLite (WAL mode), faster-whisper (tiny)
- **前端**: 原生 HTML + CSS + JS（无框架）
- **模板**: Jinja2（直接使用，不走 starlette 封装）
- **无依赖**: 无 TTS、无翻译、无语言检测、无 PDF 解析

### 目录结构

```
KiwiListen/
├── requirements.txt
├── pipeline/
│   ├── __init__.py
│   ├── db.py              # SQLite schema + CRUD
│   ├── esl_scraper.py      # HTML 抓取 + MP3 下载
│   └── aligner.py          # faster-whisper 对齐 + fuzzy 映射
└── web/
    ├── app.py              # FastAPI（直接用 jinja2 渲染）
    ├── templates/
    │   ├── index.html       # 文章列表
    │   └── listen.html      # 逐句播放器
    └── static/
        ├── kiwi.css         # Kiwi 自然色系样式
        └── js/
            └── player.js     # seek-based 单例 Audio + loop
```

### 修复的问题

| 问题 | 根因 | 解决方案 |
|------|------|----------|
| 分类页只找到 1 篇链接 | CSS 选择器 `h2 a` 不对 | 改用 `li > a[href*="?p="]` |
| 转录解析失败 | `<strong>News story</strong>` 可能在 `<p>` 内部 | 用 `find_all(["p","strong"], recursive=False)` 遍历 |
| `faster-whisper` 导入 `_get_word_timestamps` 失败 | API 不存在 | 删除该导入 |
| Jinja2 模板 500 错误 | `starlette.templating` 缓存键含 `weakref.ref`，某些环境下不可哈希 | 绕过 `Jinja2Templates`，直接用 `jinja2.Environment` |
| `listen` 路由 422 | `request` 参数缺少类型注解 `Request` | 添加 `request: Request` |

---

## 三、运行指南

```bash
# 安装依赖
pip install -r requirements.txt

# P1: 抓取文章
python -m pipeline.esl_scraper --all          # 全部
python -m pipeline.esl_scraper --limit 2       # 测试 2 篇

# P2: 对齐
python -m pipeline.aligner --all              # 全部
python -m pipeline.aligner esl-11379         # 测试单篇

# 启动 Web 服务
python -m web.app
# 或
uvicorn web.app:app --port 8001 --reload

# 访问
# http://localhost:8001        → 文章列表
# http://localhost:8001/listen/esl-11379  → 播放器
```

---

## 四、已验证结果

- ✅ Scraper: 2 篇文章全部抓取成功（MP3 + transcript）
- ✅ Aligner: 2 篇文章全部对齐成功（278/489 词时戳 → 19/27 句）
- ✅ Web: 所有路由返回 200 OK
  - `GET /` → 2350 bytes (文章列表)
  - `GET /listen/esl-11379` → 21559 bytes (播放器)
  - `GET /api/articles` → 695 bytes
  - `GET /api/article/esl-11379` → 2821 bytes

---

## 五、Phase P5 批量处理（建议下一步）

运行批量抓取和对齐：

```bash
# 抓取前 30 篇文章
python -m pipeline.esl_scraper --limit 30

# 批量对齐
python -m pipeline.aligner --all
```

---

## 六、P6 Extras（可选）

- 全进度条与播放器同步
- 语速控制（0.5x-1.5x）
- 键盘快捷键（Space/←/→/L）已有实现（player.js）

---

*文档由 Claude Code 生成。*