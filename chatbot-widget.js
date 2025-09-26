// Minimal, pretty chat widget for n8n webhooks – extended UI (side pill, emoji, image paste/upload, Esc-to-close)
(function () {
  const css = `
  :root{--cb-brand:#FF8A5B;--cb-accent:#0E7C86;--cb-bg:#ffffff;--cb-line:#e8e8e8;--cb-user:#0B5FFF;--cb-bot:#0F172A}
  /* Right-side big pill launcher */
  .cb-btn{position:fixed;right:-6px;top:45%;transform:translateY(-50%);
    border:0;border-radius:999px 0 0 999px;padding:14px 18px 14px 22px;min-width:168px;
    font:700 15px/1 system-ui,Segoe UI,Roboto,Inter,sans-serif;color:#fff;letter-spacing:.1px;
    background:linear-gradient(135deg,var(--cb-brand),#ff6a3d);box-shadow:0 12px 30px rgba(16,24,40,.18);
    cursor:pointer;z-index:999999;display:flex;align-items:center;gap:10px;transition:transform .25s ease, right .25s ease}
  .cb-btn:hover{transform:translate(-10px,-50%)}
  .cb-btn svg{width:22px;height:22px;flex:0 0 22px;fill:#fff}

  .cb-panel{position:fixed;right:18px;bottom:88px;width:420px;max-width:96vw;height:640px;display:none;
    background:var(--cb-bg);border-radius:18px;border:1px solid var(--cb-line);box-shadow:0 28px 70px rgba(16,24,40,.24);z-index:999999;overflow:hidden}
  .cb-panel.open{display:block;animation:cb-slide .22s ease}
  @keyframes cb-slide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

  .cb-head{padding:14px 14px 12px;border-bottom:1px solid var(--cb-line);display:flex;gap:12px;align-items:center;
    background:linear-gradient(135deg, #fff, #f7fafc)}
  .cb-avatar{flex:0 0 36px;width:36px;height:36px;border-radius:10px;background:var(--cb-brand);display:grid;place-items:center;color:#fff;font-weight:800}
  .cb-title{font:700 16px/1.2 system-ui,Segoe UI,Roboto,Inter,sans-serif}
  .cb-sub{font:400 12px/1.2 system-ui,Segoe UI,Roboto,Inter,sans-serif;color:#6b7280}
  .cb-head-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  .cb-crisis{font-size:12px;color:#ef4444;text-decoration:underline}
  .cb-close{background:transparent;border:0;font-size:20px;line-height:1;cursor:pointer;color:#374151;padding:6px;border-radius:8px}
  .cb-close:focus{outline:2px solid #cbd5e1}

  .cb-body{height:calc(100% - 64px - 106px);overflow:auto;padding:14px;background:#fafafa}
  .cb-msg{background:#fff;border:1px solid var(--cb-line);border-radius:16px;padding:12px 14px;margin:8px 0;max-width:85%;box-shadow:0 2px 8px rgba(0,0,0,.04)}
  .cb-bot{color:var(--cb-bot)}
  .cb-me{margin-left:auto;background:#f8fbff;border-color:#dbeafe;color:var(--cb-user)}
  .cb-msg img{max-width:220px;border-radius:12px;display:block}

  .cb-typing{display:inline-block;min-width:28px}
  .cb-typing span{display:inline-block;width:6px;height:6px;margin-right:3px;background:#9ca3af;border-radius:50%;animation:cb-b 1s infinite ease-in-out}
  .cb-typing span:nth-child(2){animation-delay:.15s}.cb-typing span:nth-child(3){animation-delay:.3s}
  @keyframes cb-b {0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}

  .cb-chipbar{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px;padding:0 14px}
  .cb-chip{background:#fff;border:1px solid var(--cb-line);border-radius:999px;padding:8px 12px;font-size:12px;cursor:pointer}

  .cb-foot{border-top:1px solid var(--cb-line);padding:10px;display:flex;gap:8px;align-items:flex-end;background:#fff}
  .cb-tools{display:flex;gap:6px;align-items:center}
  .cb-ico{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;width:36px;height:36px;display:grid;place-items:center;cursor:pointer}
  .cb-ico input{display:none}
  .cb-inp{flex:1;border:1px solid var(--cb-line);border-radius:14px;padding:10px 12px;outline:none;box-shadow:0 1px 0 rgba(0,0,0,.02);resize:none;max-height:110px}
  .cb-send{border:0;border-radius:14px;background:var(--cb-accent);color:#fff;padding:12px 14px;font-weight:700;cursor:pointer}
  .cb-send[disabled]{opacity:.6;cursor:not-allowed}
  .cb-emoji{position:relative}
  .cb-emoji-panel{position:absolute;bottom:44px;left:0;background:#fff;border:1px solid var(--cb-line);border-radius:12px;padding:8px;width:220px;height:160px;overflow:auto;display:none;box-shadow:0 10px 30px rgba(16,24,40,.18)}
  .cb-emoji-panel button{background:#fff;border:0;font-size:20px;padding:4px;border-radius:8px;cursor:pointer}
  .cb-emoji-panel button:hover{background:#f3f4f6}
  .cb-preview{display:flex;gap:6px;align-items:center;margin-top:4px}
  .cb-thumb{width:48px;height:48px;object-fit:cover;border-radius:8px;border:1px solid var(--cb-line)}

  @media (max-width: 480px){
    .cb-panel{right:8px;left:8px;bottom:80px;height:76vh;border-radius:16px}
    .cb-btn{top:auto;bottom:18px;right:18px;border-radius:999px;padding:14px 18px;transform:none}
    .cb-btn:hover{transform:none}
  }`;

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    Object.assign(el, props);
    for (const c of children) {
      typeof c === "string"
        ? el.appendChild(document.createTextNode(c))
        : c && el.appendChild(c);
    }
    return el;
  }
  function mdSafe(text) {
    return (text || "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1");
  }

  const ChatbotWidget = {
    init(opts) {
      this.endpoint = opts.endpoint;
      this.sid =
        crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

      const style = h("style");
      style.textContent = css;
      document.head.appendChild(style);

      // launcher (right side pill)
      const btn = h("button", {
        className: "cb-btn",
        innerHTML: `
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 100 18 9 9 0 000-18Zm1 13H8l-3 3V8a3 3 0 013-3h8a3 3 0 013 3v5a3 3 0 01-3 3h-3z"/></svg>
        <span>${opts.bubbleText || "Chat with us"}</span>`,
      });
      btn.style.setProperty("--cb-brand", opts.brandColor || "#FF8A5B");
      document.body.appendChild(btn);

      const panel = h("div", {
        className: "cb-panel",
        role: "dialog",
        ariaLabel: "Student Support chat",
      });
      panel.style.setProperty("--cb-brand", opts.brandColor || "#FF8A5B");
      panel.style.setProperty("--cb-accent", opts.accentColor || "#0E7C86");
      panel.style.setProperty("--cb-user", opts.userTextColor || "#0B5FFF");
      panel.style.setProperty("--cb-bot", opts.botTextColor || "#0F172A");

      // Header
      const closeBtn = h("button", {
        className: "cb-close",
        title: "Close (Esc)",
        ariaLabel: "Close chat",
        innerText: "✕",
      });
      const head = h(
        "div",
        { className: "cb-head" },
        h("div", { className: "cb-avatar" }, "SM"),
        h(
          "div",
          {},
          h("div", { className: "cb-title", innerText: opts.title || "Chat" }),
          h("div", {
            className: "cb-sub",
            innerText: opts.subtitle || "I’m here to help",
          })
        ),
        h(
          "div",
          { className: "cb-head-right" },
          h("a", {
            href: opts.crisisLink || "#",
            target: "_blank",
            className: "cb-crisis",
            innerText: "Urgent help",
          }),
          closeBtn
        )
      );

      const body = h("div", { className: "cb-body", role: "log" });
      const chipbar = h("div", { className: "cb-chipbar" });
      const foot = h("div", { className: "cb-foot" });

      // quick chips
      [
        "I feel anxious about exams",
        "I can’t sleep well",
        "How do I ground myself?",
        "Help me plan study breaks",
      ].forEach((t) =>
        chipbar.appendChild(
          h("button", { className: "cb-chip", onclick: () => send(t) }, t)
        )
      );

      // footer tools
      const tools = h("div", { className: "cb-tools" });
      const fileLabel = h(
        "label",
        { className: "cb-ico", title: "Attach image" },
        h("input", { type: "file", accept: "image/*" }),
        h("span", { innerText: "📎", ariaHidden: "true" })
      );
      const emojiWrap = h(
        "div",
        { className: "cb-emoji cb-ico", title: "Emoji" },
        h("span", { innerText: "😊" })
      );
      const emojiPanel = h("div", {
        className: "cb-emoji-panel",
        role: "menu",
      });
      emojiWrap.appendChild(emojiPanel);

      // a compact emoji list (you can extend)
      const emojis =
        "😀 😃 😄 😁 😆 😊 🙂 🙃 😉 😌 😍 🥰 😘 😚 😎 🤗 🤝 👍 👏 🙏 ✨ 🌟 💪 🧠 💙".split(
          /\s+/
        );
      emojis.forEach((e) =>
        emojiPanel.appendChild(
          h("button", { type: "button", onclick: () => insertEmoji(e) }, e)
        )
      );

      // textarea input + send
      const inp = h("textarea", {
        className: "cb-inp",
        rows: 1,
        placeholder: "Type your message…",
        ariaLabel: "Message",
      });
      const sendBtn = h("button", {
        className: "cb-send",
        innerText: "Send",
        onclick: () => send(inp.value),
      });

      tools.append(fileLabel, emojiWrap);
      foot.append(tools, inp, sendBtn);

      // image preview state
      let pendingImage = null; // {name, mime, dataURL}
      const preview = h("div", { className: "cb-preview" });
      foot.appendChild(preview);

      fileLabel.querySelector("input").addEventListener("change", (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          pendingImage = { name: f.name, mime: f.type, dataURL: reader.result };
          renderPreview();
        };
        reader.readAsDataURL(f);
        ev.target.value = "";
      });

      function renderPreview() {
        preview.innerHTML = "";
        if (pendingImage) {
          preview.appendChild(
            h("img", {
              className: "cb-thumb",
              src: pendingImage.dataURL,
              alt: pendingImage.name,
            })
          );
          preview.appendChild(
            h(
              "button",
              {
                className: "cb-ico",
                title: "Remove image",
                onclick: () => {
                  pendingImage = null;
                  renderPreview();
                },
              },
              h("span", { innerText: "✕" })
            )
          );
        }
      }

      // paste image support
      inp.addEventListener("paste", (e) => {
        const item = [...(e.clipboardData?.items || [])].find(
          (i) => i.type && i.type.startsWith("image/")
        );
        if (item) {
          const f = item.getAsFile();
          const reader = new FileReader();
          reader.onload = () => {
            pendingImage = {
              name: f.name || "pasted.png",
              mime: f.type,
              dataURL: reader.result,
            };
            renderPreview();
          };
          reader.readAsDataURL(f);
        }
      });

      // emoji toggle/insert
      emojiWrap.addEventListener("click", (e) => {
        if (e.target === emojiWrap.querySelector("span")) {
          emojiPanel.style.display =
            emojiPanel.style.display === "block" ? "none" : "block";
        }
      });
      function insertEmoji(e) {
        const start = inp.selectionStart || inp.value.length;
        const end = inp.selectionEnd || start;
        inp.value = inp.value.slice(0, start) + e + inp.value.slice(end);
        inp.focus();
        emojiPanel.style.display = "none";
      }

      // ENTER to send, Shift+Enter to newline
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send(inp.value);
        }
      });

      // open/close logic
      const setOpen = (v) => {
        panel.classList.toggle("open", v);
        if (v) {
          inp.focus();
        }
      };
      let open = false;
      btn.addEventListener("click", () => {
        open = !open;
        setOpen(open);
      });
      closeBtn.addEventListener("click", () => {
        open = false;
        setOpen(false);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && open) {
          open = false;
          setOpen(false);
        }
      });

      // assemble DOM
      panel.append(head, body, chipbar, foot);
      document.body.appendChild(panel);

      // helpers to add messages
      const add = (who, text, image) => {
        const msg = h("div", {
          className: `cb-msg ${who === "me" ? "cb-me" : "cb-bot"}`,
        });
        if (image) {
          msg.appendChild(h("img", { src: image, alt: "image" }));
        }
        if (text) {
          msg.appendChild(h("div", { innerText: mdSafe(text) }));
        }
        body.appendChild(msg);
        body.scrollTop = body.scrollHeight;
      };
      const typing = () => {
        const box = h("div", { className: "cb-msg cb-bot" });
        const dots = h("span", { className: "cb-typing" });
        dots.innerHTML = "<span></span><span></span><span></span>";
        box.appendChild(dots);
        body.appendChild(box);
        body.scrollTop = body.scrollHeight;
        return box;
      };

      const send = async (text) => {
        text = (text || "").trim();
        if (!text && !pendingImage) return;
        add("me", text, pendingImage?.dataURL);
        const payload = {
          message: text,
          image: pendingImage?.dataURL || null,
          imageName: pendingImage?.name || null,
          imageMime: pendingImage?.mime || null,
        };
        pendingImage = null;
        renderPreview();
        inp.value = "";
        sendBtn.disabled = true;
        const t = typing();
        try {
          const r = await fetch(this.endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-session-id": this.sid,
            },
            body: JSON.stringify(payload),
          });
          const isJson = r.headers
            .get("content-type")
            ?.includes("application/json");
          const data = isJson ? await r.json() : { reply: await r.text() };
          t.remove();
          add(
            "bot",
            data.reply ||
              data.answer ||
              data.output ||
              "Sorry, I had trouble replying."
          );
        } catch (e) {
          t.remove();
          add("bot", "Connection error. Please try again.");
        } finally {
          sendBtn.disabled = false;
          inp.focus();
        }
      };

      // Friendly first message
      add("bot", "Hi! I’m here to listen. Tell me what’s on your mind.");

      // expose for manual triggering
      this.send = send;
    },
  };

  window.ChatbotWidget = ChatbotWidget;
})();
