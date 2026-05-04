// ============================================================
// TikWM client through ScraperAPI
// ============================================================

function fetchPlayCountWithRetry(videoLink, maxRetry) {
  let lastError = "";
  let lastDiagnostic = {};
  const tikwmUrl = buildTikwmTargetUrl_(videoLink);
  let sessionNumber = getOrCreateScraperApiSession_();

  for (let proxySwitch = 0; proxySwitch < MAX_PROXY_SWITCHES_PER_ROW; proxySwitch++) {
    const apiKeyRecord = getActiveScraperApiKey_();
    if (!apiKeyRecord) {
      logScraperApiEvent_("SCRAPERAPI_NO_ACTIVE_KEY", "", sessionNumber, "Không còn ScraperAPI key", {
        videoLink: videoLink
      });
      return { ok: false, error: "Không còn ScraperAPI key", sessionNumber: sessionNumber };
    }

    for (let attempt = 1; attempt <= 3 && attempt <= maxRetry; attempt++) {
      try {
        const response = fetchTikwmViaScraperApi_(videoLink, apiKeyRecord.apiKey, sessionNumber);

        if (response.keyExhausted) {
          lastError = "ScraperAPI key hết credit hoặc bị từ chối";
          logScraperApiEvent_("SCRAPERAPI_KEY_EXHAUSTED", apiKeyRecord.rowIndex, sessionNumber, lastError, {
            videoLink: videoLink,
            statusCode: response.statusCode || "",
            error: response.error || ""
          });
          deleteScraperApiKeyRow_(apiKeyRecord.rowIndex, "credit/auth/rate", sessionNumber);
          break;
        }

        if (response.ok) {
          return { ok: true, playCount: response.playCount, sessionNumber: sessionNumber };
        }

        if (response.fatalTikwmError) {
          logScraperApiEvent_("TIKWM_FATAL_URL_PARSE_FAILED", apiKeyRecord.rowIndex, sessionNumber, response.error, {
            videoLink: videoLink,
            topLevelKeys: response.topLevelKeys || "",
            bodySnippet: response.bodySnippet || ""
          });
          return {
            ok: false,
            fatalTikwmError: true,
            error: response.error,
            sessionNumber: sessionNumber
          };
        }

        lastError = response.error;
        lastDiagnostic = {
          topLevelKeys: response.topLevelKeys || "",
          bodySnippet: response.bodySnippet || ""
        };
      } catch (err) {
        lastError = err.message;
        lastDiagnostic = {};
      }

      if (attempt < 3) {
        Utilities.sleep(RETRY_DELAY_MS);
      }
    }

    logScraperApiEvent_("SCRAPERAPI_SESSION_FAILED_AFTER_RETRIES", apiKeyRecord.rowIndex, sessionNumber, lastError, {
      videoLink: videoLink,
      tikwmUrl: tikwmUrl,
      proxySwitch: proxySwitch + 1,
      attemptsInSession: Math.min(3, maxRetry),
      topLevelKeys: lastDiagnostic.topLevelKeys || "",
      bodySnippet: lastDiagnostic.bodySnippet || ""
    });
    sessionNumber = rotateScraperApiSession_();
    logScraperApiEvent_("SCRAPERAPI_SESSION_ROTATED", apiKeyRecord.rowIndex, sessionNumber, "Đổi sticky session/proxy", {
      videoLink: videoLink,
      proxySwitch: proxySwitch + 1
    });
  }

  logScraperApiEvent_("SCRAPERAPI_FINAL_FAILURE", "", sessionNumber, lastError, {
    videoLink: videoLink,
    proxySwitches: MAX_PROXY_SWITCHES_PER_ROW
  });
  return {
    ok: false,
    error: "Đổi proxy/session " + MAX_PROXY_SWITCHES_PER_ROW + " lần vẫn lỗi: " + lastError,
    sessionNumber: sessionNumber
  };
}

function fetchTikwmViaScraperApi_(videoLink, apiKey, sessionNumber) {
  const tikwmUrl = buildTikwmTargetUrl_(videoLink);
  const requestUrl = SCRAPER_API_ENDPOINT
    + "?api_key=" + encodeURIComponent(apiKey)
    + "&session_number=" + encodeURIComponent(sessionNumber)
    + "&device_type=desktop"
    + "&url=" + encodeURIComponent(tikwmUrl);

  const response = UrlFetchApp.fetch(requestUrl, {
    method: "post",
    muteHttpExceptions: true,
    headers: getTikwmHeaders_()
  });

  const statusCode = response.getResponseCode();
  const body = response.getContentText();
  if (isScraperApiKeyExhausted_(statusCode, body)) {
    return { ok: false, keyExhausted: true, statusCode: statusCode, error: "ScraperAPI key exhausted/status " + statusCode };
  }
  if (statusCode < 200 || statusCode >= 300) {
    return { ok: false, error: "HTTP " + statusCode + ": " + body.slice(0, 200) };
  }

  const extracted = extractTikwmResponseJson_(body);
  if (!extracted.ok) {
    return {
      ok: false,
      error: extracted.error,
      topLevelKeys: extracted.topLevelKeys,
      bodySnippet: extracted.bodySnippet
    };
  }

  const json = extracted.json;

  if (json.code !== -1 && json.data && json.data.play_count !== undefined) {
    return { ok: true, playCount: json.data.play_count };
  }

  if (isTikwmFatalUrlError_(json)) {
    return {
      ok: false,
      error: json.msg || "Url parsing is failed! Please check url.",
      topLevelKeys: extracted.topLevelKeys,
      bodySnippet: extracted.bodySnippet,
      fatalTikwmError: true
    };
  }

  return {
    ok: false,
    error: "TikWM code=" + json.code + " msg=" + (json.msg || ""),
    topLevelKeys: extracted.topLevelKeys,
    bodySnippet: extracted.bodySnippet
  };
}

function isTikwmFatalUrlError_(json) {
  if (!json || json.code !== -1) return false;
  const message = String(json.msg || "").toLowerCase();
  return message.includes("url parsing is failed") || message.includes("please check url");
}

function buildTikwmTargetUrl_(videoLink) {
  return TIKWM_ENDPOINT + "?url=" + String(videoLink || "").trim();
}

function extractTikwmResponseJson_(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch (err) {
    return {
      ok: false,
      error: "Không parse được JSON từ ScraperAPI/TikWM",
      topLevelKeys: "",
      bodySnippet: safeSnippet_(body)
    };
  }

  const direct = pickTikwmJson_(json);
  if (direct) {
    return {
      ok: true,
      json: direct,
      topLevelKeys: getTopLevelKeys_(json),
      bodySnippet: safeSnippet_(body)
    };
  }

  const wrappedFields = ["body", "content", "result", "response", "html", "data"];
  for (let index = 0; index < wrappedFields.length; index++) {
    const fieldName = wrappedFields[index];
    const nested = parseJsonField_(json, fieldName);
    const picked = pickTikwmJson_(nested);
    if (picked) {
      return {
        ok: true,
        json: picked,
        topLevelKeys: getTopLevelKeys_(json),
        bodySnippet: safeSnippet_(body)
      };
    }
  }

  return {
    ok: false,
    error: "ScraperAPI trả JSON nhưng không phải shape TikWM",
    topLevelKeys: getTopLevelKeys_(json),
    bodySnippet: safeSnippet_(body)
  };
}

function pickTikwmJson_(value) {
  if (!value || typeof value !== "object") return null;
  if (value.code !== undefined && value.data !== undefined) return value;
  if (value.data && typeof value.data === "object" && value.data.code !== undefined && value.data.data !== undefined) {
    return value.data;
  }
  return null;
}

function parseJsonField_(json, fieldName) {
  if (!json || json[fieldName] === undefined || json[fieldName] === null) return null;
  const value = json[fieldName];
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

function getTopLevelKeys_(value) {
  if (!value || typeof value !== "object") return "";
  return Object.keys(value).slice(0, 20).join(",");
}

function safeSnippet_(value) {
  return String(value || "").replace(/\s+/g, " ").slice(0, 500);
}

function getTikwmHeaders_() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
    "X-Requested-With": "XMLHttpRequest",
    "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"'
  };
}

function isScraperApiKeyExhausted_(statusCode, body) {
  if (statusCode === 401 || statusCode === 402 || statusCode === 403 || statusCode === 429) return true;
  const text = String(body || "").toLowerCase();
  return text.includes("api key") && (text.includes("limit") || text.includes("credit") || text.includes("exhaust") || text.includes("invalid"));
}
