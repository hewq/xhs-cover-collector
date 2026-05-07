import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

type InspirationItem = {
  id: string;
  title: string;
  url: string;
  author?: string;
  coverUrl?: string;
  category: string;
  titleType: string;
  note: string;
  createdAt: string;
};

type XhsPageInfo = {
  title: string;
  author?: string;
  coverUrl?: string;
};

const STORAGE_KEY = "xhs_cover_inspirations";

const defaultCategories = [
  "封面参考",
  "爆款标题",
  "干货清单",
  "避坑指南",
  "课程推广",
  "账号对标",
];

const titleTypes = [
  "未分类",
  "干货清单",
  "避坑指南",
  "教程步骤",
  "对比测评",
  "经验复盘",
  "情绪共鸣",
  "好物推荐",
  "课程推广",
];

function App() {
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [currentAuthor, setCurrentAuthor] = useState("");
  const [currentCoverUrl, setCurrentCoverUrl] = useState("");
  const [category, setCategory] = useState(defaultCategories[0]);
  const [titleType, setTitleType] = useState(titleTypes[0]);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  useEffect(() => {
    loadCurrentTab();
    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return items.filter((item) => {
      const matchedCategory =
        selectedCategory === "全部" || item.category === selectedCategory;

      const matchedKeyword =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.url.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.titleType.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q) ||
        (item.author || "").toLowerCase().includes(q);

      return matchedCategory && matchedKeyword;
    });
  }, [items, keyword, selectedCategory]);

  async function loadCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      setCurrentTitle(tab?.title || "未命名页面");
      setCurrentUrl(tab?.url || "");

      if (tab.id && tab.url?.includes("xiaohongshu.com")) {
        await extractXhsPageInfo(tab.id);
      }
    } catch {
      setCurrentTitle("未能读取当前页面");
      setCurrentUrl("");
    }
  }

  async function extractXhsPageInfo(tabId: number) {
    setIsExtracting(true);

    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          function getMetaContent(property: string) {
            const meta =
              document.querySelector(`meta[property="${property}"]`) ||
              document.querySelector(`meta[name="${property}"]`);

            return meta?.getAttribute("content") || "";
          }

          const ogTitle = getMetaContent("og:title");
          const ogImage = getMetaContent("og:image");
          const description = getMetaContent("description");

          const titleCandidates = [
            ogTitle,
            document.querySelector("title")?.textContent || "",
            document.querySelector("h1")?.textContent || "",
          ];

          const imageCandidates = [
            ogImage,
            document.querySelector("img")?.getAttribute("src") || "",
          ];

          const authorSelectors = [
            ".username",
            ".author",
            ".user-name",
            ".nickname",
            "[class*='author']",
            "[class*='user']",
            "[class*='name']",
          ];

          let author = "";

          for (const selector of authorSelectors) {
            const element = document.querySelector(selector);
            const text = element?.textContent?.trim();

            if (text && text.length <= 30) {
              author = text;
              break;
            }
          }

          const title =
            titleCandidates
              .map((item) => item.trim())
              .find((item) => item && item.length > 0) || "";

          const coverUrl =
            imageCandidates
              .map((item) => item.trim())
              .find((item) => item && item.startsWith("http")) || "";

          return {
            title,
            author,
            coverUrl,
            description,
          };
        },
      });

      const info = result?.result as XhsPageInfo | undefined;

      if (info?.title) {
        setCurrentTitle(info.title);
      }

      if (info?.author) {
        setCurrentAuthor(info.author);
      }

      if (info?.coverUrl) {
        setCurrentCoverUrl(info.coverUrl);
      }
    } catch (error) {
      console.warn("提取小红书页面信息失败：", error);
    } finally {
      setIsExtracting(false);
    }
  }

  async function loadItems() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const saved = result[STORAGE_KEY] as InspirationItem[] | undefined;

    const normalized = (saved || []).map((item) => ({
      ...item,
      titleType: item.titleType || "未分类",
    }));

    setItems(normalized);
  }

  async function saveItems(nextItems: InspirationItem[]) {
    setItems(nextItems);
    await chrome.storage.local.set({
      [STORAGE_KEY]: nextItems,
    });
  }

  async function handleSave() {
    if (!currentUrl) return;

    const existed = items.some((item) => item.url === currentUrl);

    if (existed) {
      const confirmed = window.confirm(
        "这个页面已经保存过了，是否继续保存一份？",
      );
      if (!confirmed) return;
    }

    const newItem: InspirationItem = {
      id: crypto.randomUUID(),
      title: currentTitle || "未命名页面",
      url: currentUrl,
      author: currentAuthor,
      coverUrl: currentCoverUrl,
      category,
      titleType,
      note,
      createdAt: new Date().toISOString(),
    };

    await saveItems([newItem, ...items]);
    setNote("");
  }

  async function handleDelete(id: string) {
    const nextItems = items.filter((item) => item.id !== id);
    await saveItems(nextItems);
  }

  function handleExportCsv() {
    const header = [
      "标题",
      "作者",
      "封面图",
      "链接",
      "分类",
      "标题类型",
      "备注",
      "收藏时间",
    ];

    const rows = items.map((item) => [
      item.title,
      item.author || "",
      item.coverUrl || "",
      item.url,
      item.category,
      item.titleType || "",
      item.note,
      new Date(item.createdAt).toLocaleString(),
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell).replaceAll('"', '""');
            return `"${value}"`;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "小红书封面灵感库.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  function handleExportMarkdown() {
    if (items.length === 0) return;

    const sortedItems = [...items].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const content = `# 小红书封面灵感库

导出时间：${new Date().toLocaleString()}

共 ${sortedItems.length} 条灵感

${sortedItems
  .map((item, index) => {
    return `## ${index + 1}. ${item.title}

- 作者：${item.author || "未记录"}
- 分类：${item.category}
- 标题类型：${item.titleType || "未分类"}
- 链接：${item.url}
- 封面图：${item.coverUrl || "未记录"}
- 收藏时间：${new Date(item.createdAt).toLocaleString()}

### 备注

${item.note || "暂无备注"}

### 拆解模板

- 目标人群：
- 核心痛点：
- 结果承诺：
- 情绪钩子：
- 封面可借鉴点：
- 可以改写成：

---

`;
  })
  .join("\n")}`;

    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "小红书封面灵感库.md";
    a.click();

    URL.revokeObjectURL(url);
  }

  async function handleCopyAnalysis(item: InspirationItem) {
    const text = `【小红书灵感拆解】

标题：
${item.title}

作者：
${item.author || "未记录"}

原文链接：
${item.url}

分类：
${item.category}

标题类型：
${item.titleType || "未分类"}

收藏原因：
${item.note || "这条内容的标题、封面或选题值得参考。"}

标题结构拆解：
- 目标人群：
- 核心痛点：
- 结果承诺：
- 情绪钩子：
- 关键词：

封面可借鉴点：
- 主标题是否醒目：
- 字数是否足够短：
- 颜色是否有记忆点：
- 是否适合手机端快速识别：

我可以改写成：
1.
2.
3.

适合我的账号方向：
- `;

    await navigator.clipboard.writeText(text);
    window.alert("已复制小红书灵感拆解模板");
  }

  const isXhsPage = currentUrl.includes("xiaohongshu.com");

  return (
    <main className="min-h-screen w-[380px] bg-[#fff7f7] text-zinc-950">
      <header className="border-b border-red-100 bg-white px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-red-500 text-white">
            <Sparkles className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-base font-bold">小红书封面灵感夹</h1>
            <p className="text-xs text-zinc-500">收藏封面、标题和选题灵感</p>
          </div>
        </div>
      </header>

      <section className="space-y-4 p-4">
        <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">当前页面</h2>
            <span
              className={`rounded-full px-2 py-1 text-[11px] ${
                isXhsPage
                  ? "bg-red-50 text-red-600"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {isXhsPage ? "小红书页面" : "普通网页"}
            </span>
          </div>

          {currentCoverUrl ? (
            <div className="mb-3 overflow-hidden rounded-xl border border-red-100 bg-zinc-100">
              <img
                src={currentCoverUrl}
                alt={currentTitle || "封面图"}
                className="h-36 w-full object-cover"
              />
            </div>
          ) : (
            <div className="mb-3 flex h-36 items-center justify-center rounded-xl border border-dashed border-red-100 bg-red-50 text-xs text-red-400">
              暂未识别到封面图，可手动粘贴图片链接
            </div>
          )}

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              标题
            </label>
            <input
              value={currentTitle}
              onChange={(event) => setCurrentTitle(event.target.value)}
              placeholder="请输入标题"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              作者
            </label>
            <input
              value={currentAuthor}
              onChange={(event) => setCurrentAuthor(event.target.value)}
              placeholder="例如：某某博主"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              封面图链接
            </label>
            <input
              value={currentCoverUrl}
              onChange={(event) => setCurrentCoverUrl(event.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            />
          </div>

          <p className="mt-2 line-clamp-1 text-xs text-zinc-500">
            {currentUrl || "暂无链接"}
          </p>

          {isExtracting && (
            <p className="mt-2 text-xs text-red-500">正在尝试提取页面信息...</p>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              分类
            </label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            >
              {defaultCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              标题类型
            </label>
            <select
              value={titleType}
              onChange={(event) => setTitleType(event.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            >
              {titleTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              备注
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="例如：封面标题很醒目，适合做避坑类内容"
              className="h-20 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!currentUrl}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            <Plus className="h-4 w-4" />
            保存到灵感库
          </button>
        </div>

        <div className="rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">我的灵感库</h2>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                disabled={items.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>

              <button
                onClick={handleExportMarkdown}
                disabled={items.length === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="h-3.5 w-3.5" />
                MD
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索标题、分类或备注"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {["全部", ...defaultCategories].map((item) => (
              <button
                key={item}
                onClick={() => setSelectedCategory(item)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                  selectedCategory === item
                    ? "bg-red-500 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-zinc-700">还没有收藏</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                打开一篇小红书笔记或任意网页，点击上方按钮保存灵感。
              </p>
            </div>
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-zinc-100 bg-zinc-50 p-3"
                >
                  {item.coverUrl && (
                    <div className="mb-3 overflow-hidden rounded-lg bg-zinc-100">
                      <img
                        src={item.coverUrl}
                        alt={item.title}
                        className="h-28 w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <p className="line-clamp-2 text-sm font-medium leading-5">
                        {item.title}
                      </p>

                      {item.author && (
                        <p className="mt-1 text-xs text-zinc-500">
                          作者：{item.author}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-[11px] text-red-600">
                          {item.category}
                        </span>

                        {item.titleType && item.titleType !== "未分类" && (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] text-amber-600">
                            {item.titleType}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(item.id)}
                      className="rounded-lg p-1 text-zinc-400 hover:bg-white hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {item.note && (
                    <p className="mb-2 text-xs leading-5 text-zinc-500">
                      {item.note}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleCopyAnalysis(item)}
                        className="inline-flex items-center gap-1 text-zinc-500 hover:text-red-500"
                      >
                        复制拆解
                        <Copy className="h-3.5 w-3.5" />
                      </button>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-red-500"
                      >
                        打开
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
