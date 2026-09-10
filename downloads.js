(function () {
  const list = document.getElementById("downloads-list");
  const refreshButton = document.getElementById("refresh-downloads");
  const lastCheck = document.getElementById("last-check");
  const currentFolder = document.getElementById("current-folder");
  const rootPath = "downloads/";
  const baseUrl = new URL(rootPath, window.location.href);
  let currentPath = rootPath;

  function setMessage(text) {
    list.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  }

  function getRelativePathFromRoot(fullPath) {
    return fullPath.startsWith(rootPath)
      ? fullPath.slice(rootPath.length)
      : fullPath;
  }

  function updateCurrentFolderLabel() {
    currentFolder.textContent = "Aktueller Ordner: " + currentPath;
  }

  function goToParentPath(path) {
    const relative = getRelativePathFromRoot(path).replace(/\/$/, "");
    if (!relative) {
      return rootPath;
    }
    const parts = relative.split("/").filter(Boolean);
    parts.pop();
    return rootPath + (parts.length ? parts.join("/") + "/" : "");
  }

  function updateLastCheck() {
    const now = new Date();
    lastCheck.textContent = "Letzte Aktualisierung: " + now.toLocaleString("de-DE");
  }

  function parseDateFromText(text) {
    if (!text) {
      return null;
    }

    const monthMap = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
    };

    const isoLike = text.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
    if (isoLike) {
      const seconds = isoLike[3] || "00";
      return new Date(isoLike[1] + "T" + isoLike[2] + ":" + seconds);
    }

    const deLike = text.match(/(\d{2})\.(\d{2})\.(\d{4})[, ]+(\d{2}:\d{2})(?::(\d{2}))?/);
    if (deLike) {
      const seconds = deLike[5] || "00";
      return new Date(deLike[3] + "-" + deLike[2] + "-" + deLike[1] + "T" + deLike[4] + ":" + seconds);
    }

    const apacheLike = text.match(/(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
    if (apacheLike) {
      const month = monthMap[apacheLike[2].toLowerCase()];
      if (!month) {
        return null;
      }
      const seconds = apacheLike[5] || "00";
      return new Date(apacheLike[3] + "-" + month + "-" + apacheLike[1] + "T" + apacheLike[4] + ":" + seconds);
    }

    return null;
  }

  function formatGermanDateTime(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      return "unbekannt";
    }

    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(dateValue);
  }

  function cleanDisplayNameFromPath(relativePath, isFolder) {
    const trimmed = isFolder && relativePath.endsWith("/")
      ? relativePath.slice(0, -1)
      : relativePath;
    const parts = trimmed.split("/").filter(Boolean);
    const name = parts.length ? parts[parts.length - 1] : trimmed;
    return decodeURIComponent(name || relativePath);
  }

  function extractContextText(anchor) {
    const pieces = [];

    if (anchor.nextSibling && anchor.nextSibling.textContent) {
      pieces.push(anchor.nextSibling.textContent);
    }

    const row = anchor.closest("tr, li, td");
    if (row && row.textContent) {
      pieces.push(row.textContent);
    }

    const pre = anchor.closest("pre");
    if (pre && pre.textContent) {
      const name = (anchor.textContent || "").trim();
      const lines = pre.textContent.split(/\r?\n/);
      const matchingLine = lines.find(function (line) {
        return name && line.includes(name);
      });
      if (matchingLine) {
        pieces.push(matchingLine);
      }
    }

    return pieces.join(" ").trim();
  }

  function detectFileIcon(fileName, isFolder) {
    if (isFolder) {
      return "📁";
    }

    const lower = fileName.toLowerCase();
    const ext = lower.includes(".") ? lower.split(".").pop() : "";

    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
      return "🖼️";
    }
    if (["mp3", "wav", "flac", "ogg", "m4a"].includes(ext)) {
      return "🎵";
    }
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
      return "🎬";
    }
    if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) {
      return "🗜️";
    }
    if (["pdf", "doc", "docx", "txt", "md", "rtf", "odt"].includes(ext)) {
      return "📄";
    }
    if (["exe", "msi", "apk", "deb", "rpm", "bat", "cmd", "sh"].includes(ext)) {
      return "⚙️";
    }

    return "📄";
  }

  function resolveModifiedAt(resourceUrl, fallbackValue) {
    return fetch(resourceUrl + (resourceUrl.includes("?") ? "&" : "?") + "_=" + Date.now(), {
      method: "HEAD",
      cache: "no-store"
    })
      .then(function (response) {
        if (!response.ok) {
          return fallbackValue;
        }

        const lastModified = response.headers.get("last-modified");
        if (!lastModified) {
          return fallbackValue;
        }

        const parsed = new Date(lastModified);
        const formatted = formatGermanDateTime(parsed);
        return formatted === "unbekannt" ? fallbackValue : formatted;
      })
      .catch(function () {
        return fallbackValue;
      });
  }

  function detectFolderByRequest(item) {
    if (item.isFolder) {
      return Promise.resolve(true);
    }

    const resourceUrl = rootPath + item.href;
    return fetch(resourceUrl + (resourceUrl.includes("?") ? "&" : "?") + "_=" + Date.now(), {
      method: "HEAD",
      cache: "no-store",
      redirect: "follow"
    })
      .then(function (response) {
        if (!response.ok) {
          return false;
        }

        const finalPath = new URL(response.url, window.location.href).pathname;
        if (finalPath.endsWith("/")) {
          return true;
        }

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        const hasFileExtension = /\.[a-z0-9]{1,8}$/i.test(item.text || "");
        if (!hasFileExtension && contentType.includes("text/html")) {
          return true;
        }

        return false;
      })
      .catch(function () {
        return false;
      });
  }

  function normalizeItem(rawHref, rawText, contextText, listingPath) {
    if (!rawHref || rawHref === "../" || rawText === "Parent Directory") {
      return null;
    }

    if (rawHref.startsWith("?") || rawHref.startsWith("#")) {
      return null;
    }

    let url;
    try {
      url = new URL(rawHref, new URL(listingPath, window.location.href));
    } catch (error) {
      return null;
    }

    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
      return null;
    }

    let relativePath = url.pathname.slice(baseUrl.pathname.length);
    if (!relativePath) {
      return null;
    }

    if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }

    if (!relativePath) {
      return null;
    }

    const isFolder =
      url.pathname.endsWith("/") ||
      rawHref.endsWith("/") ||
      rawText.endsWith("/") ||
      /\[DIR\]|\bdirectory\b|\bordner\b|\bdir\b/i.test(contextText || "");
    const finalPath = isFolder && !relativePath.endsWith("/")
      ? relativePath + "/"
      : relativePath;
    const displayName = cleanDisplayNameFromPath(finalPath, isFolder);

    return {
      href: finalPath,
      text: displayName,
      isFolder: isFolder,
      modifiedAt: isFolder ? "" : formatGermanDateTime(parseDateFromText(contextText || ""))
    };
  }

  function parseApacheTableItems(doc, listingPath) {
    const rows = Array.from(doc.querySelectorAll("table tr"));
    if (!rows.length) {
      return [];
    }

    const items = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const link = row.querySelector("a[href]");
      if (!link) {
        return;
      }

      const href = (link.getAttribute("href") || "").trim();
      const text = (link.textContent || "").trim();
      const cells = row.querySelectorAll("td");
      const dateText = cells.length > 2 ? (cells[2].textContent || "").trim() : "";
      const iconAlt = ((row.querySelector("img[alt]") || {}).alt || "").toUpperCase();

      const item = normalizeItem(href, text, dateText || row.textContent || "", listingPath);
      if (!item || seen.has(item.href)) {
        return;
      }

      if (iconAlt.includes("[DIR]")) {
        item.isFolder = true;
        if (!item.href.endsWith("/")) {
          item.href += "/";
        }
        item.text = cleanDisplayNameFromPath(item.href, true);
        item.modifiedAt = "";
      } else if (!item.isFolder && dateText) {
        item.modifiedAt = formatGermanDateTime(parseDateFromText(dateText));
      }

      seen.add(item.href);
      items.push(item);
    });

    return items;
  }

  function renderItems(items) {
    list.innerHTML = "";
    createParentEntry();

    items.forEach(function (item) {
      const li = document.createElement("li");
      const main = document.createElement("div");
      main.className = "item-main";

      const icon = document.createElement("span");
      icon.className = "item-icon";
      icon.textContent = detectFileIcon(item.text || item.href, item.isFolder);

      const a = document.createElement("a");

      a.href = rootPath + item.href;
      a.textContent = item.text;
      if (item.isFolder) {
        a.addEventListener("click", function (event) {
          event.preventDefault();
          loadDownloads(rootPath + item.href);
        });
      }

      const type = document.createElement("span");
      type.className = "item-type";
      type.textContent = item.isFolder ? "Ordner" : "Datei";

      const time = document.createElement("span");
      if (!item.isFolder) {
        time.className = "item-time";
        time.textContent = item.modifiedAt;
      }

      main.appendChild(icon);
      main.appendChild(a);
      main.appendChild(type);

      li.appendChild(main);
      if (!item.isFolder) {
        li.appendChild(time);
      }
      list.appendChild(li);
    });

    updateLastCheck();
    document.querySelector(".fallback a").setAttribute("href", currentPath);
  }

  function createParentEntry() {
    if (currentPath === rootPath) {
      return;
    }

    const li = document.createElement("li");
    li.className = "nav-up";

    const main = document.createElement("div");
    main.className = "item-main";

    const icon = document.createElement("span");
    icon.className = "item-icon";
    icon.textContent = "⬆";

    const a = document.createElement("a");
    a.href = "#";
    a.textContent = "In uebergeordneten Ordner wechseln";
    a.addEventListener("click", function (event) {
      event.preventDefault();
      loadDownloads(goToParentPath(currentPath));
    });

    const type = document.createElement("span");
    type.className = "item-type";
    type.textContent = "Ordner";

    main.appendChild(icon);
    main.appendChild(a);
    main.appendChild(type);
    li.appendChild(main);
    list.appendChild(li);
  }

  function loadDownloads(pathToLoad) {
    if (typeof pathToLoad === "string" && pathToLoad) {
      currentPath = pathToLoad;
    }

    updateCurrentFolderLabel();
    setMessage("Inhalt wird geladen...");

    fetch(currentPath + "?_=" + Date.now(), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Verzeichnis konnte nicht geladen werden.");
        }
        return response.text();
      })
      .then(function (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const apacheItems = parseApacheTableItems(doc, currentPath);

        if (apacheItems.length) {
          renderItems(apacheItems);
          return;
        }

        const links = Array.from(doc.querySelectorAll("a"));

        const items = links
          .map(function (a) {
            const parentText = extractContextText(a);
            return normalizeItem(
              (a.getAttribute("href") || "").trim(),
              (a.textContent || "").trim(),
              parentText,
              currentPath
            );
          })
          .filter(function (item) {
            return item !== null;
          });

        if (!items.length) {
          list.innerHTML = "";
          createParentEntry();
          const li = document.createElement("li");
          li.textContent = "Der aktuelle Ordner ist leer oder die Verzeichnisanzeige ist deaktiviert.";
          list.appendChild(li);
          updateLastCheck();
          document.querySelector(".fallback a").setAttribute("href", currentPath);
          return;
        }

        Promise.all(items.map(function (item) {
          return detectFolderByRequest(item)
            .then(function (isFolderByRequest) {
              if (isFolderByRequest) {
                item.isFolder = true;
                if (!item.href.endsWith("/")) {
                  item.href += "/";
                }
                item.text = cleanDisplayNameFromPath(item.href, true);
                item.modifiedAt = "";
                return item;
              }

              item.isFolder = false;
              item.text = cleanDisplayNameFromPath(item.href, false);
              return resolveModifiedAt(rootPath + item.href, item.modifiedAt)
                .then(function (resolvedTime) {
                  item.modifiedAt = resolvedTime;
                  return item;
                });
            });
        }))
          .then(function (resolvedItems) {
            renderItems(resolvedItems);
          });
      })
      .catch(function () {
        setMessage("Automatische Liste derzeit nicht verfuegbar.");
        updateLastCheck();
      });
  }

  refreshButton.addEventListener("click", function () {
    loadDownloads(currentPath);
  });
  loadDownloads(rootPath);
})();
