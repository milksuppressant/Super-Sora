// Change this to the URL pattern of the request that returns the access token.
// The "*" are wildcards.
const TOKEN_URL_PATTERN = "*api/auth/session*";

// The website this extension should run on.
const TARGET_SITE_ORIGIN = "https://sora.chatgpt.com";

let inpaint_items = [];

// Listener for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Ensure the page is fully loaded and the URL matches our target site
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.startsWith(TARGET_SITE_ORIGIN)
  ) {
    // Check if the accessToken already exists in the page's localStorage
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: () => localStorage.getItem("accessToken"),
      })
      .then((injectionResults) => {
        const existingToken = injectionResults[0].result;
        if (!existingToken) {
          console.log(
            "Access token not found. Attaching debugger to listen for it."
          );
          attachDebugger(tabId);
        } else {
          console.log("Access token already exists.");
        }
      });
  }
});

// Function to attach the debugger and listen for the network request
function attachDebugger(tabId) {
  const debuggee = { tabId: tabId };

  chrome.debugger.attach(debuggee, "1.3", () => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      return;
    }
    console.log("Debugger attached to tab " + tabId);

    // Enable the Fetch domain to intercept network requests
    chrome.debugger.sendCommand(debuggee, "Fetch.enable", {
      patterns: [{ urlPattern: TOKEN_URL_PATTERN, requestStage: "Response" }],
    });
  });

  // Add a listener for debugger events
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId !== tabId) return; // Only listen to events from our target tab

    if (method === "Fetch.requestPaused") {
      const requestId = params.requestId;
      console.log(`Request paused: ${params.request.url}`);

      // Get the response body
      chrome.debugger.sendCommand(
        debuggee,
        "Fetch.getResponseBody",
        { requestId },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            console.error(
              "Could not get response body:",
              chrome.runtime.lastError?.message
            );
            // Make sure to continue the request even if we fail
            chrome.debugger.sendCommand(debuggee, "Fetch.continueRequest", {
              requestId,
            });
            return;
          }

          const body = response.base64Encoded
            ? atob(response.body)
            : response.body;
          try {
            const data = JSON.parse(body);
            // IMPORTANT: Adjust this line based on the actual structure of your JSON response
            const accessToken =
              data.accessToken || data.token || data.session_token;

            if (accessToken) {
              console.log("Found accessToken:", accessToken);
              // Inject a script to save the token to the page's localStorage
              chrome.scripting
                .executeScript({
                  target: { tabId: tabId },
                  func: (token) => {
                    localStorage.setItem("accessToken", token);
                  },
                  args: [accessToken],
                })
                .then(() => {
                  console.log(
                    "Token saved to localStorage. Detaching debugger."
                  );
                  // Detach the debugger once we have the token
                  chrome.debugger.detach(debuggee);
                });
            }
          } catch (e) {
            console.error("Failed to parse JSON from response body.", e);
          }

          // IMPORTANT: Always continue the request so the page doesn't hang
          chrome.debugger.sendCommand(debuggee, "Fetch.continueRequest", {
            requestId,
          });
        }
      );
    }
  });

  // Also detach the debugger if the user navigates away or closes the tab
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId === tabId) {
      console.log("Debugger detached. Reason:", reason);
      // Clean up the event listener to avoid memory leaks
      chrome.debugger.onEvent.removeListener(arguments.callee);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "sendPrompt") {
    // Find the currently active tab
    const { style, prompt, size, frames, orientation } = message.data;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        chrome.runtime.sendMessage({
          action: "failed",
          data: "No active tab found.",
        });
        return;
      }
      const tabId = tabs[0].id;

      // Execute a script in the active tab to get the token from its localStorage
      chrome.scripting
        .executeScript({
          target: { tabId: tabId },
          func: () => localStorage.getItem("accessToken"),
        })
        .then((injectionResults) => {
          const token = injectionResults[0].result;

          if (!token) {
            chrome.runtime.sendMessage({
              action: "failed",
              data: "Please reload the sora webpage",
            });
            console.log("Please reload the sora webpage");
            return;
          }

          const body = JSON.stringify({
            kind: "video",
            prompt,
            title: null,
            orientation,
            size,
            n_frames: frames,
            inpaint_items,
            remix_target_id: null,
            cameo_ids: null,
            cameo_replacements: null,
            model: "sy_8",
            style_id: style,
            audio_caption: null,
            audio_transcript: null,
            video_caption: null,
            storyboard_id: null,
          });

          // Send the fetch request
          fetch("https://sora.chatgpt.com/backend/nf/create", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              Authorization: `Bearer ${token}`,
              accept: "*/*",
              "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            },
            body,
            mode: "cors",
            credentials: "include",
          })
            .then((response) => {
              if (!response.ok) {
                console.log("NOT OKAY " + JSON.stringify(response));
                throw new Error(`HTTP error! Status: ${response.status}`);
              }
              return response.json();
            })
            .then((data) => {
              console.log("Success");
              sendResponse({ success: true });
              chrome.runtime.sendMessage({
                action: "success",
              });
            })
            .catch((error) => {
              chrome.runtime.sendMessage({
                action: "failed",
                data: error.message,
              });
              sendResponse({ success: false });
              console.log("Error:", error.message);
            });
        });
    });
    return true;
  }
  if (message.action === "addInpaint") {
    const tempItem = {
      kind: "upload",
      upload_id: message.data.id,
    };
    inpaint_items = [tempItem];
    return true;
  }
  if (message.action === "clearInpaint") {
    inpaint_items = [];
    return true;
  }
});
