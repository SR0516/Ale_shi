// ==========================================
// Website template script
// - Local HTTP server: scan the posts/ directory listing
// - GitHub Pages: scan the repository through the GitHub Contents API
// ==========================================

const POSTS_DIRECTORY = "posts/";

// --- 1. Theme ---
function initTheme() {
    const themeSelect = document.getElementById("themeSelect");
    if (!themeSelect) return;

    let savedTheme = "dark";
    try {
        savedTheme = localStorage.getItem("site_theme") || "dark";
    } catch (error) {
        // Storage may be unavailable in restricted browser contexts.
    }

    document.documentElement.setAttribute("data-theme", savedTheme);
    themeSelect.value = savedTheme;

    themeSelect.addEventListener("change", (event) => {
        const theme = event.target.value;
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem("site_theme", theme);
        } catch (error) {
            // The theme still works for the current page even without storage.
        }
    });
}

// --- 2. Profile & header ---
async function loadProfile() {
    try {
        const response = await fetch(new URL("profile.json", document.baseURI));
        if (!response.ok) {
            throw new Error(`profile.json: HTTP ${response.status}`);
        }

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
            if (profile.avatar_bg) {
                heroAvatar.style.backgroundColor = profile.avatar_bg;
            }
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

// Resolve paths in profile.json relative to the website root.
function resolveSiteResourceUrl(path) {
    if (!path) return path;
    return new URL(path, new URL(".", document.baseURI)).href;
}

// --- 3. Find Markdown posts ---
function getGitHubRepositoryConfig(profile) {
    const github = profile && profile.github ? profile.github : {};

    // Optional explicit settings are useful with custom domains or unusual Pages URLs.
    if (github.owner && github.repo) {
        return {
            owner: github.owner,
            repo: github.repo,
            branch: github.branch || ""
        };
    }

    // Automatic detection for https://OWNER.github.io/ and project Pages URLs.
    const hostMatch = window.location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!hostMatch) return null;

    const owner = hostMatch[1];
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const firstPart = pathParts[0] || "";
    const isProjectPages = firstPart !== "" && !firstPart.includes(".");
    const repo = isProjectPages ? firstPart : `${owner}.github.io`;

    return {
        owner,
        repo,
        branch: github.branch || ""
    };
}

function getSlugsFromDirectoryListing(html, listingUrl) {
    const documentFromListing = new DOMParser().parseFromString(html, "text/html");
    const postsDirectoryUrl = new URL(POSTS_DIRECTORY, document.baseURI);
    const slugs = new Set();

    documentFromListing.querySelectorAll("a[href]").forEach((anchor) => {
        try {
            const fileUrl = new URL(anchor.getAttribute("href"), listingUrl);
            if (fileUrl.origin !== postsDirectoryUrl.origin) return;
            if (!fileUrl.pathname.startsWith(postsDirectoryUrl.pathname)) return;

            const fileName = decodeURIComponent(fileUrl.pathname.split("/").pop() || "");
            if (!fileName.endsWith(".md")) return;

            const slug = fileName.slice(0, -3);
            if (slug && slug !== "." && slug !== "..") {
                slugs.add(slug);
            }
        } catch (error) {
            // Ignore malformed or unrelated directory links.
        }
    });

    return Array.from(slugs);
}

async function scanLocalPosts() {
    const directoryUrl = new URL(POSTS_DIRECTORY, document.baseURI);
    const response = await fetch(directoryUrl);
    if (!response.ok) return [];

    const html = await response.text();
    return getSlugsFromDirectoryListing(html, response.url || directoryUrl.href);
}

async function scanGitHubPosts(profile) {
    const config = getGitHubRepositoryConfig(profile);
    if (!config) return [];

    const apiUrl = new URL(
        `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/posts`
    );
    apiUrl.searchParams.set("per_page", "100");
    if (config.branch) {
        apiUrl.searchParams.set("ref", config.branch);
    }

    const response = await fetch(apiUrl.href, {
        headers: { Accept: "application/vnd.github+json" }
    });

    if (!response.ok) {
        throw new Error(`GitHub API: HTTP ${response.status}`);
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) return [];

    // Only Markdown files directly inside posts/ are posts; asset/ is ignored.
    return entries
        .filter((entry) => entry.type === "file" && typeof entry.name === "string" && entry.name.endsWith(".md"))
        .map((entry) => entry.name.slice(0, -3));
}

function resolvePostResourceUrl(path) {
    if (!path) return path;

    const value = path.trim();
    if (!value) return value;

    // Keep absolute URLs, protocol-relative URLs, anchors and special schemes unchanged.
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) {
        return value;
    }

    const siteRoot = new URL(".", document.baseURI);
    const cleanPath = value.replace(/^\.\//, "");

    // Allow both `asset/image.png` (relative to posts/) and `posts/asset/image.png`.
    if (cleanPath.startsWith("posts/")) {
        return new URL(cleanPath, siteRoot).href;
    }

    return new URL(cleanPath, new URL(POSTS_DIRECTORY, siteRoot)).href;
}

async function fetchPostData(slug) {
    try {
        const markdownUrl = new URL(
            `${POSTS_DIRECTORY}${encodeURIComponent(slug)}.md`,
            document.baseURI
        );
        const response = await fetch(markdownUrl);
        if (!response.ok) return null;

        const markdown = await response.text();
        const titleMatch = markdown.match(/^#\s+(.*)$/m);
        const title = titleMatch ? titleMatch[1].trim() : slug;

        const imageMatch = markdown.match(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/);
        const imagePath = imageMatch ? (imageMatch[1] || imageMatch[2]) : null;

        return {
            slug,
            title,
            image: imagePath ? resolvePostResourceUrl(imagePath) : null
        };
    } catch (error) {
        console.warn(`Post load failed (${slug}):`, error);
        return null;
    }
}

async function fetchAllPosts(profile = null) {
    let slugs = [];

    // First try the local web server's directory listing (e.g. python -m http.server).
    try {
        slugs = await scanLocalPosts();
    } catch (error) {
        console.info("Local posts directory listing is unavailable; trying GitHub Pages API.");
    }

    // GitHub Pages does not expose directory listings, so query the public repository.
    if (slugs.length === 0) {
        try {
            slugs = await scanGitHubPosts(profile);
        } catch (error) {
            console.warn("GitHub post scan failed:", error);
        }
    }

    const uniqueSlugs = Array.from(new Set(slugs));
    const posts = await Promise.all(uniqueSlugs.map(fetchPostData));
    return posts.filter(Boolean);
}

// --- 4. Markdown rendering helpers ---
function renderMarkdown(markdown, container, isPost = false) {
    if (!container) return;
    if (!window.marked || typeof window.marked.parse !== "function") {
        container.textContent = "Markdownの描画ライブラリを読み込めませんでした。";
        return;
    }

    const html = window.marked.parse(markdown);
    if (!isPost) {
        container.innerHTML = html;
        return;
    }

    // Markdown resources are relative to the Markdown file in posts/,
    // not relative to post.html.
    const parsed = new DOMParser().parseFromString(html, "text/html");
    parsed.querySelectorAll("img[src], a[href]").forEach((element) => {
        const attribute = element.tagName === "IMG" ? "src" : "href";
        const originalUrl = element.getAttribute(attribute);
        if (originalUrl) {
            element.setAttribute(attribute, resolvePostResourceUrl(originalUrl));
        }
    });

    container.innerHTML = parsed.body.innerHTML;
}

// --- 5. Home page ---
async function initHomePage() {
    initTheme();
    const profile = await loadProfile();

    const markdownContainer = document.getElementById("markdownContent");
    try {
        const response = await fetch(new URL("content.md", document.baseURI));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        renderMarkdown(await response.text(), markdownContainer);
    } catch (error) {
        if (markdownContainer) {
            markdownContainer.textContent = "content.md が見つかりません。";
        }
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
    anchor.href = `post.html?slug=${encodeURIComponent(post.slug)}`;

    const meta = document.createElement("div");
    meta.className = "post-meta";
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-feather-pointed";
    meta.appendChild(icon);
    meta.appendChild(document.createTextNode(" Post"));

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

// --- 7. Single post page ---
async function initPostPage() {
    initTheme();
    await loadProfile();

    const contentEl = document.getElementById("postContent");
    const headerEl = document.getElementById("postHeader");
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug");

    if (!slug || slug.includes("/") || slug.includes("\\") || slug === "." || slug === "..") {
        if (contentEl) {
            contentEl.innerHTML = "<h2>エラー</h2><p>記事が指定されていません。</p>";
        }
        return;
    }

    try {
        const markdownUrl = new URL(
            `${POSTS_DIRECTORY}${encodeURIComponent(slug)}.md`,
            document.baseURI
        );
        const response = await fetch(markdownUrl);
        if (!response.ok) {
            throw new Error(`Markdown not found (HTTP ${response.status})`);
        }

        const markdown = await response.text();
        const titleMatch = markdown.match(/^#\s+(.*)$/m);
        const title = titleMatch ? titleMatch[1].trim() : slug;

        if (headerEl) {
            const heading = document.createElement("h1");
            heading.textContent = title;
            headerEl.replaceChildren(heading);
        }

        document.title = `${title} - Post`;
        renderMarkdown(markdown, contentEl, true);
    } catch (error) {
        if (contentEl) {
            const heading = document.createElement("h2");
            heading.textContent = "記事の読み込みに失敗しました";
            const message = document.createElement("p");
            message.textContent = error.message;
            contentEl.replaceChildren(heading, message);
        }
    }
}
