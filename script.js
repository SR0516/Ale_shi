// =====================================================
// Website template script
// - Local HTTP server: automatically scans the posts/ directory
// - GitHub Pages: automatically scans the repository via GitHub Contents API
// - Shared post URLs: ?id=... (old ?slug=... URLs are also supported)
// - Stable post IDs: optional Markdown front matter `id:`
// =====================================================

const POSTS_DIRECTORY = "posts/";

// GitHub PagesのURLからリポジトリを自動判定できない場合（カスタムドメイン等）だけ設定。
// 通常の https://OWNER.github.io/REPO/ なら空欄のままでOK。
const GITHUB_CONFIG = {
    owner: "",       // GitHubユーザー名 / Organization名
    repo: "",        // リポジトリ名
    branch: "",      // Pagesの公開元ブランチ。空欄ならリポジトリのデフォルトブランチ
    postsPath: ""    // 必要なら変更（例: "docs/posts"）。空欄なら posts/
};

// --- Utility ---
function siteUrl(path) {
    return new URL(path, document.baseURI);
}

function getFrontMatterValue(markdown, key) {
    const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
    if (!match) return "";

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const valueMatch = match[1].match(new RegExp(`^${escapedKey}\\s*:\\s*(.*?)\\s*$`, "mi"));
    if (!valueMatch) return "";

    return valueMatch[1].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) =>
        doubleQuoted ?? singleQuoted ?? ""
    );
}

function getMarkdownTitle(markdown, fallback) {
    return getFrontMatterValue(markdown, "title") ||
        ((markdown.match(/^#\s+(.*)$/m) || [])[1] || fallback).trim();
}

function getMarkdownId(markdown, fallbackSlug) {
    // `id:`を設定しておけば、Markdownファイル名を変更しても共有URLを維持できる。
    return getFrontMatterValue(markdown, "id") || fallbackSlug;
}

function stripFrontMatter(markdown) {
    return markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
}

// --- 1. Theme ---
function initTheme() {
    const themeSelect = document.getElementById("themeSelect");
    if (!themeSelect) return;

    let savedTheme = "dark";
    try {
        savedTheme = localStorage.getItem("site_theme") || "dark";
    } catch (_) {
        // localStorageが使えない環境でもテーマ切り替え自体は動作させる。
    }

    const availableThemes = Array.from(themeSelect.options).map((option) => option.value);
    if (!availableThemes.includes(savedTheme)) savedTheme = "dark";

    document.documentElement.setAttribute("data-theme", savedTheme);
    themeSelect.value = savedTheme;

    themeSelect.addEventListener("change", (event) => {
        const theme = event.target.value;
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem("site_theme", theme);
        } catch (_) {}
    });
}

// --- 2. Profile & header ---
async function loadProfile() {
    try {
        const response = await fetch(siteUrl("profile.json"));
        if (!response.ok) throw new Error(`profile.json: HTTP ${response.status}`);

        const profile = await response.json();
        const heroEl = document.querySelector(".hero-section");
        const heroName = document.getElementById("heroName");
        const heroTitle = document.getElementById("heroTitle");
        const heroBio = document.getElementById("heroBio");
        const heroAvatar = document.getElementById("heroAvatar");

        if (heroName) heroName.textContent = profile.name || "";
        if (heroTitle) heroTitle.textContent = profile.title || "";
        if (heroBio) heroBio.textContent = profile.bio || "";

        if (heroAvatar && profile.avatar) {
            heroAvatar.src = resolveSiteResourceUrl(profile.avatar);
            if (profile.avatar_bg) heroAvatar.style.backgroundColor = profile.avatar_bg;
        }

        if (heroEl) {
            if (profile.hero_bg_type === "image" && profile.hero_bg_image) {
                heroEl.style.backgroundImage = `url("${resolveSiteResourceUrl(profile.hero_bg_image)}")`;
                heroEl.style.backgroundSize = "cover";
                heroEl.style.backgroundPosition = "center";
            } else if (profile.hero_bg_color) {
                heroEl.style.background = profile.hero_bg_color;
            }
        }

        const headerNav = document.getElementById("headerNav");
        if (headerNav && Array.isArray(profile.header_links)) {
            headerNav.replaceChildren();
            profile.header_links.forEach((link) => {
                const anchor = document.createElement("a");
                anchor.href = link.url || "#";
                anchor.className = "header-nav-link";
                if (link.icon) {
                    const icon = document.createElement("i");
                    icon.className = link.icon;
                    anchor.appendChild(icon);
                }
                anchor.appendChild(document.createTextNode(link.name || "Link"));
                headerNav.appendChild(anchor);
            });
        }

        const socialNav = document.getElementById("socialNav");
        if (socialNav && Array.isArray(profile.socials)) {
            socialNav.replaceChildren();
            profile.socials.forEach((social) => {
                const anchor = document.createElement("a");
                anchor.href = social.url || "#";
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.setAttribute("aria-label", social.name || "Social link");
                if (social.icon) {
                    const icon = document.createElement("i");
                    icon.className = social.icon;
                    anchor.appendChild(icon);
                }
                socialNav.appendChild(anchor);
            });
        }

        return profile;
    } catch (error) {
        console.error("Profile load error:", error);
        return null;
    }
}

function resolveSiteResourceUrl(path) {
    if (!path) return path;
    return new URL(path, new URL(".", document.baseURI)).href;
}

// --- 3. Detect post files ---
function getGitHubRepositoryConfig(profile) {
    const profileGitHub = profile?.github || {};
    const owner = GITHUB_CONFIG.owner || profileGitHub.owner || "";
    const repo = GITHUB_CONFIG.repo || profileGitHub.repo || "";

    // 手動設定がある場合は、カスタムドメインでも利用できる。
    if (owner && repo) {
        return {
            owner,
            repo,
            branch: GITHUB_CONFIG.branch || profileGitHub.branch || "",
            postsPath: GITHUB_CONFIG.postsPath || profileGitHub.postsPath || "posts"
        };
    }

    // https://OWNER.github.io/ または https://OWNER.github.io/REPO/ を判定。
    const hostMatch = window.location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!hostMatch) return null;

    const detectedOwner = hostMatch[1];
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const firstPart = pathParts[0] || "";
    const rootPageNames = new Set(["index.html", "post.html", "posts.html", "404.html"]);
    const isUserSiteRoot = !firstPart || rootPageNames.has(firstPart.toLowerCase());

    return {
        owner: detectedOwner,
        repo: isUserSiteRoot ? `${detectedOwner}.github.io` : firstPart,
        branch: GITHUB_CONFIG.branch || profileGitHub.branch || "",
        postsPath: GITHUB_CONFIG.postsPath || profileGitHub.postsPath || "posts"
    };
}

function getSlugsFromDirectoryListing(html, listingUrl) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const postsDirectoryUrl = siteUrl(POSTS_DIRECTORY);
    const slugs = new Set();

    parsed.querySelectorAll("a[href]").forEach((anchor) => {
        try {
            const fileUrl = new URL(anchor.getAttribute("href"), listingUrl);
            if (fileUrl.origin !== postsDirectoryUrl.origin) return;
            if (!fileUrl.pathname.startsWith(postsDirectoryUrl.pathname)) return;

            const encodedName = fileUrl.pathname.split("/").pop() || "";
            const fileName = decodeURIComponent(encodedName);
            if (!fileName.toLowerCase().endsWith(".md")) return;

            const slug = fileName.slice(0, -3);
            if (slug && slug !== "." && slug !== "..") slugs.add(slug);
        } catch (_) {
            // 不正なリンクやMarkdown以外は無視。
        }
    });

    return Array.from(slugs);
}

async function scanLocalPosts() {
    const directoryUrl = siteUrl(POSTS_DIRECTORY);
    const response = await fetch(directoryUrl);
    if (!response.ok) return [];

    const html = await response.text();
    return getSlugsFromDirectoryListing(html, response.url || directoryUrl.href);
}

async function scanGitHubPosts(profile) {
    const config = getGitHubRepositoryConfig(profile);
    if (!config) return [];

    const apiUrl = new URL(
        `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${config.postsPath.split("/").map(encodeURIComponent).join("/")}`
    );
    apiUrl.searchParams.set("per_page", "100");
    if (config.branch) apiUrl.searchParams.set("ref", config.branch);

    const response = await fetch(apiUrl.href, {
        headers: { Accept: "application/vnd.github+json" }
    });
    if (!response.ok) throw new Error(`GitHub API: HTTP ${response.status}`);

    const entries = await response.json();
    if (!Array.isArray(entries)) return [];

    return entries
        .filter((entry) => entry.type === "file" && typeof entry.name === "string" && entry.name.toLowerCase().endsWith(".md"))
        .map((entry) => entry.name.slice(0, -3));
}

function resolvePostResourceUrl(path) {
    if (!path) return path;
    const value = String(path).trim();
    if (!value) return value;

    // 外部URL、ページ内アンカー、mailto:等は変更しない。
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return value;

    const siteRoot = new URL(".", document.baseURI);
    const cleanPath = value.replace(/^\.\//, "");

    // `posts/asset/a.png` と `asset/a.png` の両方に対応。
    if (cleanPath.startsWith("posts/")) return new URL(cleanPath, siteRoot).href;
    return new URL(cleanPath, new URL(POSTS_DIRECTORY, siteRoot)).href;
}

async function fetchPostData(slug) {
    try {
        const markdownUrl = siteUrl(`${POSTS_DIRECTORY}${encodeURIComponent(slug)}.md`);
        const response = await fetch(markdownUrl);
        if (!response.ok) return null;

        const markdown = await response.text();
        const imageMatch = markdown.match(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/);
        const imagePath = imageMatch ? (imageMatch[1] || imageMatch[2]) : null;

        return {
            slug,
            id: getMarkdownId(markdown, slug),
            title: getMarkdownTitle(markdown, slug),
            image: imagePath ? resolvePostResourceUrl(imagePath) : null
        };
    } catch (error) {
        console.warn(`Post load failed (${slug}):`, error);
        return null;
    }
}

async function fetchAllPosts(profile = null) {
    let slugs = [];

    // ローカルHTTPサーバーではposts/のディレクトリ一覧を利用。
    try {
        slugs = await scanLocalPosts();
    } catch (_) {
        // GitHub Pagesではディレクトリ一覧を取得できないため次へ。
    }

    // GitHub PagesではGitHub APIからposts/直下のMarkdownだけ取得。
    if (slugs.length === 0) {
        try {
            slugs = await scanGitHubPosts(profile);
        } catch (error) {
            console.warn("GitHub post scan failed:", error);
        }
    }

    const uniqueSlugs = Array.from(new Set(slugs));
    const posts = (await Promise.all(uniqueSlugs.map(fetchPostData))).filter(Boolean);

    // 投稿IDが重複していると共有先を特定できないため、重複を警告する。
    const seenIds = new Set();
    for (const post of posts) {
        if (seenIds.has(post.id)) console.warn(`Duplicate post id: ${post.id}`);
        seenIds.add(post.id);
    }

    return posts;
}

// --- 4. Markdown rendering ---
function renderMarkdown(markdown, container, isPost = false) {
    if (!container) return;
    if (!window.marked || typeof window.marked.parse !== "function") {
        container.textContent = "Markdownの描画ライブラリを読み込めませんでした。";
        return;
    }

    const source = isPost ? stripFrontMatter(markdown) : markdown;
    const html = window.marked.parse(source);
    if (!isPost) {
        container.innerHTML = html;
        return;
    }

    // 投稿内の画像・リンクはMarkdownファイル(posts/)を基準に相対パスを解決。
    const parsed = new DOMParser().parseFromString(html, "text/html");
    parsed.querySelectorAll("img[src], a[href]").forEach((element) => {
        const attribute = element.tagName === "IMG" ? "src" : "href";
        const originalUrl = element.getAttribute(attribute);
        if (originalUrl) element.setAttribute(attribute, resolvePostResourceUrl(originalUrl));
    });
    container.innerHTML = parsed.body.innerHTML;
}

// --- 5. Home page ---
async function initHomePage() {
    initTheme();
    const profile = await loadProfile();

    const markdownContainer = document.getElementById("markdownContent");
    try {
        const response = await fetch(siteUrl("content.md"));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        renderMarkdown(await response.text(), markdownContainer);
    } catch (_) {
        if (markdownContainer) markdownContainer.textContent = "content.md が見つかりません。";
    }

    const feedEl = document.getElementById("postsFeed");
    if (!feedEl) return;

    const posts = await fetchAllPosts(profile);
    feedEl.replaceChildren();
    if (posts.length === 0) {
        feedEl.innerHTML = "<p class='loading-text'>投稿がありません。</p>";
        return;
    }

    posts.slice(0, 5).forEach((post) => feedEl.appendChild(createPostCard(post)));
}

// --- 6. All posts page ---
async function initPostsPage() {
    initTheme();
    const profile = await loadProfile();

    const container = document.getElementById("allPostsContainer");
    if (!container) return;

    const posts = await fetchAllPosts(profile);
    container.replaceChildren();
    if (posts.length === 0) {
        container.innerHTML = "<p class='loading-text'>投稿がありません。</p>";
        return;
    }

    posts.forEach((post) => container.appendChild(createPostCard(post)));
}

function createPostCard(post) {
    const anchor = document.createElement("a");
    anchor.className = "reddit-post-card";

    // ?id=... を使う。日本語や記号もURLSearchParamsが正しくエンコードする。
    // 古い ?slug=... URLも initPostPage() 側で引き続き読み込める。
    const postUrl = siteUrl("post.html");
    postUrl.searchParams.set("id", post.id || post.slug);
    anchor.href = postUrl.href;

    const meta = document.createElement("div");
    meta.className = "post-meta";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-feather-pointed";
    meta.append(icon, document.createTextNode(" Post"));

    const title = document.createElement("div");
    title.className = "post-card-title";
    title.textContent = post.title;
    anchor.append(meta, title);

    if (post.image) {
        const image = document.createElement("img");
        image.src = post.image;
        image.className = "post-card-media";
        image.alt = "";
        image.loading = "lazy";
        anchor.appendChild(image);
    }

    return anchor;
}

// --- 7. Share button (HTML編集不要) ---
function addShareButton(headerEl) {
    if (!headerEl || headerEl.querySelector(".post-share-button")) return;

    const styleId = "post-share-button-style";
    if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            .post-share-actions { margin-top: 1rem; display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
            .post-share-button { border: 1px solid var(--border); background: var(--bg-main); color: var(--text-main); padding: .55rem .9rem; border-radius: 8px; cursor: pointer; font: inherit; font-size: .85rem; transition: .2s; }
            .post-share-button:hover { border-color: var(--accent); color: var(--accent); }
            .post-share-status { color: var(--text-sub); font-size: .8rem; }
        `;
        document.head.appendChild(style);
    }

    const actions = document.createElement("div");
    actions.className = "post-share-actions";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "post-share-button";
    button.textContent = "リンクをコピー";

    const status = document.createElement("span");
    status.className = "post-share-status";
    status.setAttribute("aria-live", "polite");

    button.addEventListener("click", async () => {
        const shareUrl = window.location.href;
        try {
            if (navigator.clipboard?.writeText && window.isSecureContext) {
                await navigator.clipboard.writeText(shareUrl);
            } else {
                window.prompt("このURLをコピーしてください:", shareUrl);
                return;
            }
            status.textContent = "コピーしました！";
            button.textContent = "コピー済み";
        } catch (error) {
            window.prompt("コピーできませんでした。URLをコピーしてください:", shareUrl);
        }
    });

    actions.append(button, status);
    headerEl.appendChild(actions);
}

// --- 8. Single post page ---
async function initPostPage() {
    initTheme();
    const profile = await loadProfile();

    const contentEl = document.getElementById("postContent");
    const headerEl = document.getElementById("postHeader");
    const params = new URLSearchParams(window.location.search);

    // 新URLは?id=...、従来の?slug=...も後方互換で対応。
    const postId = params.get("id");
    const legacySlug = params.get("slug");
    const requestedValue = postId || legacySlug;

    if (!requestedValue || requestedValue.includes("/") || requestedValue.includes("\\") || requestedValue === "." || requestedValue === "..") {
        showPostError(contentEl, "記事が指定されていません。URLを確認してください。");
        return;
    }

    try {
        let slug = legacySlug || requestedValue;

        // ?id=... の場合、全投稿のMarkdown front matterからIDに対応するファイル名を探す。
        // これによりMarkdownファイル名を変更しても、idを維持すれば古い共有URLが使える。
        if (postId) {
            const posts = await fetchAllPosts(profile);
            const matchedPost = posts.find((post) => post.id === postId);
            if (matchedPost) {
                slug = matchedPost.slug;
            } else {
                // front matter未設定時は、idをファイル名としても試す。
                slug = postId;
            }
        }

        const markdownUrl = siteUrl(`${POSTS_DIRECTORY}${encodeURIComponent(slug)}.md`);
        const response = await fetch(markdownUrl);
        if (!response.ok) throw new Error(`記事が見つかりません (HTTP ${response.status})`);

        const markdown = await response.text();
        const title = getMarkdownTitle(markdown, slug);

        if (headerEl) {
            const heading = document.createElement("h1");
            heading.textContent = title;
            headerEl.replaceChildren(heading);
            addShareButton(headerEl);
        }

        document.title = `${title} - Post`;
        renderMarkdown(markdown, contentEl, true);
    } catch (error) {
        console.error("Post load error:", error);
        showPostError(contentEl, error.message || "記事の読み込みに失敗しました。");
    }
}

function showPostError(container, message) {
    if (!container) return;
    const heading = document.createElement("h2");
    heading.textContent = "記事の読み込みに失敗しました";
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    container.replaceChildren(heading, paragraph);
}
