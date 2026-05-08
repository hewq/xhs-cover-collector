import { useEffect, useMemo, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  Lightbulb,
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

type UserPreferences = {
  category: string;
  titleType: string;
  myField: string;
};

const STORAGE_KEY = "xhs_cover_inspirations";
const PREFERENCES_KEY = "xhs_cover_preferences";

const COVER_MAKER_URL = "https://xhs-cover-maker.vercel.app/";

// const FREE_LIMIT = 50;

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
  const [myField, setMyField] = useState("前端副业");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    loadCurrentTab();
    loadItems();
    loadPreferences();
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;

    savePreferences({
      category,
      titleType,
      myField,
    });
  }, [category, titleType, myField, preferencesLoaded]);

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

  async function loadPreferences() {
    const result = await chrome.storage.local.get(PREFERENCES_KEY);
    const preferences = result[PREFERENCES_KEY] as UserPreferences | undefined;

    if (preferences) {
      if (preferences.category) {
        setCategory(preferences.category);
      }

      if (preferences.titleType) {
        setTitleType(preferences.titleType);
      }

      if (preferences.myField) {
        setMyField(preferences.myField);
      }
    }

    setPreferencesLoaded(true);
  }

  async function savePreferences(nextPreferences: UserPreferences) {
    await chrome.storage.local.set({
      [PREFERENCES_KEY]: nextPreferences,
    });
  }

  async function saveItems(nextItems: InspirationItem[]) {
    setItems(nextItems);
    await chrome.storage.local.set({
      [STORAGE_KEY]: nextItems,
    });
  }

  async function handleSave() {
    if (!currentUrl) return;

    // if (items.length >= FREE_LIMIT) {
    //   window.alert(
    //     "免费版最多保存 50 条灵感。你可以先导出 Markdown 备份，后续 Pro 版会支持无限收藏。",
    //   );
    //   return;
    // }

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
- ${myField.trim() || ""}`;

    await navigator.clipboard.writeText(text);
    window.alert("已复制小红书灵感拆解模板");
  }

  function generateRewriteTitles(item: InspirationItem) {
    const type = item.titleType || "未分类";

    const commonTitles = [
      "新手做【你的领域】，先别急着开始，建议先看完这篇",
      "普通人想做好【你的领域】，真正重要的是这 3 件事",
      "做【你的领域】之前，我希望有人早点告诉我这些",
      "为什么你做【你的领域】一直没结果？可能是方向错了",
      "适合普通人的【你的领域】入门路线，建议收藏",
    ];

    const titleMap: Record<string, string[]> = {
      干货清单: [
        "做【你的领域】必备的 7 个方法，新手建议收藏",
        "我整理了【你的领域】最实用的 10 个技巧",
        "想做好【你的领域】，这 5 个工具 / 方法一定要知道",
        "一篇讲清楚【你的领域】从 0 到 1 怎么做",
        "新手入门【你的领域】，照着这份清单做就够了",
      ],
      避坑指南: [
        "新手做【你的领域】，千万别一开始就踩这 5 个坑",
        "做【你的领域】之前，这几个错误一定要避开",
        "我做【你的领域】踩过的坑，建议你提前知道",
        "别再盲目做【你的领域】了，先避开这些误区",
        "普通人做【你的领域】，最容易忽略的 3 个问题",
      ],
      教程步骤: [
        "手把手教你做【你的领域】，新手也能跟着做",
        "从 0 开始做【你的领域】，完整流程来了",
        "新手做【你的领域】的 5 个步骤，照着做就行",
        "第一次做【你的领域】，建议按这个顺序来",
        "一篇讲清楚【你的领域】的完整操作流程",
      ],
      对比测评: [
        "做【你的领域】，A 和 B 到底怎么选？",
        "我对比了 3 种【你的领域】方法，结果很意外",
        "新手做【你的领域】，别再选错工具了",
        "【你的领域】常见方案对比，看完就知道怎么选",
        "普通人做【你的领域】，更推荐这一个方案",
      ],
      经验复盘: [
        "做【你的领域】这段时间，我总结了 5 个经验",
        "从不会到上手【你的领域】，我踩过这些坑",
        "做【你的领域】一个月后，我最大的感受是",
        "我为什么建议新手这样做【你的领域】",
        "普通人做【你的领域】，这是我目前最真实的复盘",
      ],
      情绪共鸣: [
        "做【你的领域】真的很难，但这几点让我坚持下来",
        "如果你也在做【你的领域】，这篇写给你",
        "普通人做【你的领域】，最难的不是开始",
        "别焦虑，做【你的领域】可以慢慢来",
        "做【你的领域】没人告诉你的真实感受",
      ],
      好物推荐: [
        "做【你的领域】后，我最常用的 5 个工具",
        "这些【你的领域】好物 / 工具，真的提高效率",
        "新手做【你的领域】，我推荐先准备这些",
        "提升【你的领域】效率的工具清单，建议收藏",
        "我愿意反复推荐的【你的领域】工具",
      ],
      课程推广: [
        "想系统学习【你的领域】，这套方法适合你",
        "如果你正在卡在【你的领域】，可以看看这个方案",
        "我把【你的领域】入门路径整理成了一套课程",
        "适合新手的【你的领域】学习路线来了",
        "想少走弯路做【你的领域】，可以从这里开始",
      ],
    };

    const field = myField.trim() || "你的领域";
    const templates = titleMap[type] || commonTitles;

    return templates.map((title) => title.replaceAll("【你的领域】", field));
  }

  async function handleCopyRewriteTitles(item: InspirationItem) {
    const titles = generateRewriteTitles(item);

    const text = `【小红书标题改写候选】

原始标题：
${item.title}

标题类型：
${item.titleType || "未分类"}

当前领域：
${myField.trim() || "未填写"}

可改写方向：
${titles.map((title, index) => `${index + 1}. ${title}`).join("\n")}

使用说明：
你可以继续把标题里的领域、人群、结果承诺改得更具体，例如把“前端副业”改成“前端工程师下班副业”。`;

    await navigator.clipboard.writeText(text);
    window.alert("已复制标题改写候选");
  }

  function handleOpenCoverMaker(item: InspirationItem) {
    const params = new URLSearchParams({
      title: item.title,
      author: item.author || "",
      category: item.category,
      titleType: item.titleType || "",
      field: myField.trim() || "",
      sourceUrl: item.url,
    });

    const targetUrl = `${COVER_MAKER_URL}?${params.toString()}`;

    chrome.tabs.create({
      url: targetUrl,
    });
  }

  function handleOpenCoverMakerHome() {
    chrome.tabs.create({
      url: COVER_MAKER_URL,
    });
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
              我的领域
            </label>
            <input
              value={myField}
              onChange={(event) => setMyField(event.target.value)}
              placeholder="例如：前端副业、小红书运营、AI 工具、职场成长"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400"
            />
            <p className="mt-1 text-[11px] leading-4 text-zinc-400">
              生成改写标题时会使用这个领域，插件会自动记住你的选择。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {["小红书运营", "前端副业", "AI 工具", "职场成长"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMyField(item)}
                  className={`rounded-full px-2 py-1 text-[11px] transition ${
                    myField === item
                      ? "bg-red-500 text-white"
                      : "bg-red-50 text-red-500 hover:bg-red-100"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setCategory(defaultCategories[0]);
                setTitleType(titleTypes[0]);
                setMyField("前端副业");
              }}
              className="mt-2 text-[11px] text-zinc-400 hover:text-red-500"
            >
              重置默认偏好
            </button>
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
            <div>
              <h2 className="text-sm font-semibold">我的灵感库</h2>
              {/* <p className="mt-0.5 text-xs text-zinc-400">
                已收藏 {items.length} 条，免费版建议上限 {FREE_LIMIT} 条
              </p> */}
            </div>

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

          <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-orange-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
                <Sparkles className="h-5 w-5" />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  想把灵感变成自己的封面？
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  已支持跳转到小红卡片生成器，把收藏的标题灵感快速变成小红书封面和轮播卡片。
                </p>

                <button
                  onClick={handleOpenCoverMakerHome}
                  className="mt-3 inline-flex rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white hover:bg-red-600"
                >
                  打开小红卡片
                </button>
              </div>
            </div>
          </div>

          <div className="mb-3 mt-3 flex gap-2 overflow-x-auto pb-1">
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

                  <div className="flex items-center justify-between">
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>

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

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => handleCopyAnalysis(item)}
                      className="inline-flex items-center gap-1 text-zinc-500 hover:text-red-500"
                    >
                      复制拆解
                      <Copy className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => handleCopyRewriteTitles(item)}
                      className="inline-flex items-center gap-1 text-zinc-500 hover:text-red-500"
                    >
                      生成改写
                      <Lightbulb className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => handleOpenCoverMaker(item)}
                      className="inline-flex items-center gap-1 text-red-500 hover:text-red-600"
                    >
                      生成封面
                      <ImagePlus className="h-3.5 w-3.5" />
                    </button>
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
