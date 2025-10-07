//prevent form from submitting

document.getElementById("sora-form").addEventListener("submit", (e) => {
  e.preventDefault();
});

// clear access token when clicked
document.getElementById("clearBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      chrome.runtime.sendMessage({
        action: "failed",
        data: "No active tab found.",
      });
      return;
    }
    const tabId = tabs[0].id;
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: () => localStorage.removeItem("accessToken"),
      })
      .then(() => {
        document.getElementById("status").textContent =
          "Please reload twice or login.";
      });
  });
});

//prevent enter from reloading
document.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("sendRequestBtn").click();
  }
});

// add message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "success") {
    document.getElementById("status").textContent = "Success!";
  } else if (message.action === "failed") {
    document.getElementById("status").textContent = message.data;
  }
});

// add click listener
document
  .getElementById("sendRequestBtn")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    sendRequest();
  });

// request function
function sendRequest() {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Sending...";
  const promptInput = document.getElementById("prompt");

  const styleInput = document.getElementById("style");
  const sizeInput = document.querySelector('input[name="size"]:checked');
  const framesInput = document.getElementById("frames");

  const orientationInput = document.querySelector(
    'input[name="orientation"]:checked'
  );

  const size = sizeInput.value;
  const frames = framesInput.value;
  const style = styleInput.value;
  const prompt = promptInput.value;
  const orientation = orientationInput.value;

  if (!prompt) {
    statusEl.textContent = "";
    return;
  }

  // Execute a script in the active tab to get the token from its localStorage
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      chrome.runtime.sendMessage({
        action: "failed",
        data: "No active tab found.",
      });
      return;
    }
    const tabId = tabs[0].id;
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: () => localStorage.getItem("accessToken"),
      })
      .then((injectionResults) => {
        const existingToken = injectionResults[0].result;
        if (!existingToken) {
          statusEl.textContent =
            "No Token. Please reload the sora webpage twice";
          document.getElementById("warning").textContent =
            "Do not touch the debug, it will disappear";
          return;
        }

        chrome.runtime.sendMessage({
          action: "sendPrompt",
          data: {
            size,
            frames,
            style,
            prompt,
            orientation,
          },
        });
      });
  });
}
