chrome.runtime.sendMessage({ action: "clearInpaint" });
document.getElementById("sora-form").addEventListener("submit", (e) => {
  e.preventDefault();
});

document.getElementById("uploadBtn").addEventListener("click", (e) => {
  e.preventDefault();

  document.getElementById("imageUpload").click();
});

document.getElementById("imageUpload").addEventListener("change", (e) => {
  const image = e.target.files[0];
  if (!image) {
    return;
  }
  const status = document.getElementById("status");
  status.textContent = "Uploading...";

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
        const token = injectionResults[0].result;

        if (!token) {
          status.textContent = "Please reload the sora webpage";
          console.log("Please reload the sora webpage");
          return;
        }
        const formData = new FormData();
        formData.append("file", image);

        fetch("https://sora.chatgpt.com/backend/uploads", {
          method: "POST",
          mode: "cors",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          },
          body: formData,
        })
          .then((response) => {
            if (!response.ok) {
              status.textContent = "Image upload failed";
              console.log("NOT OKAY " + JSON.stringify(response));
              throw new Error(`HTTP error! Status: ${response.status}`);
            }

            status.textContent = "Image upload success";
            response.json().then((data) => {
              chrome.runtime.sendMessage({
                action: "addInpaint",
                data,
              });
            });
            return;
          })
          .catch((error) => {
            chrome.runtime.sendMessage({
              action: "failed",
              data: error.message,
            });
          });
      });
  });
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
        document.getElementById("warning").textContent =
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
    document.getElementById("status").textContent = message.data
      ? message.data
      : "Success!";
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
    promptInput.setCustomValidity("Please enter a prompt");
    promptInput.reportValidity();
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
