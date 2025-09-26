// Minimal, pretty chat widget for n8n webhooks – extended UI
(function () {
  const css = `
  :root{--cb-brand:#FF8A5B;--cb-accent:#0E7C86;--cb-bg:#ffffff;--cb-line:#e8e8e8}
  .cb-btn{position:fixed;right:18px;bottom:18px;border:0;border-radius:999px;
    padding:12px 16px;font:600 14px/1 system-ui,Segoe UI,Roboto,Inter,sans-serif;color:#fff;
    background:var(--cb-brand);box-shadow:0 12px 30px rgba(16,24,40,.18);cursor:pointer;z-index:999999}
  .cb-btn:hover{transform:translateY(-1px)}
  .cb-panel{position:fixed;right:18px;bottom:88px;width:420px;max-width:96vw;height:640px;display:none;
    background:var(--cb-bg);border-radius:18px;border:1px solid var(--cb-line);box-shadow:0 28px 70px rgba(16,24,40,.24);z-index:999999;overflow:hidden}
  .cb-head{padding:14px;border-bottom:1px solid var(--cb-line);display:flex;gap:12px;align-items:center;
    background:linear-gradient(135deg, #fff, #f7fafc)}
  .cb-avatar{flex:0 0 36px;width:36px;height:36px;border-radius:10px;background:var(--cb-brand);display:grid;place-items:center;color:#fff;font-weight:800}
  .cb-title{font:700 16px/1.2 system-ui,Segoe UI,Roboto,Inter,sans-serif}
  .cb-sub{font:400 12px/1.2 system-ui,Segoe UI,Roboto,Inter,sans-serif;color:#6b7280}
  .cb-head-right{margin-left:auto;display:flex;align-items:center;gap:10px}
  .cb-crisis{font-size:12px;color:#ef4444;text-decoration:underline}
  .cb-body{height:calc(100% - 62px - 88px);overflow:auto;padding:14px;background:#fafafa}
  .cb-msg{background:#fff;border:1px solid var(--cb-line);border-radius:16px;padding:12px 14px;margin:8px 0;max-width:85%;box-shadow:0 2px 8px rgba(0,0,0,.04)}
  .cb-me{margin-left:auto;background:#f8fbff;border-color:#dbeafe}
  .cb-bot strong{font-weight:700}
  .cb-typing{display:inline-block;min-width:28px}
  .cb-typing span{display:inline-block;width:6px;height:6px;margin-right:3px;background:#9ca3af;border-radius:50%;
    animation:cb-b 1s infinite ease-in-out}
  .cb-typing span:nth-child(2){animation-delay:.15s}.cb-typing span:nth-child(3){animation-delay:.3s}
  @keyframes cb-b {0%,80%,100%{opacity:.2;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}
  .cb-chipbar{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px}
  .cb-chip{background:#fff;border:1px solid var(--cb-line);border-radius:999px;padding:8px 12px;font-size:12px;cursor:pointer}
  .cb-foot{border-top:1px solid var(--cb-line);padding:12px;display:flex;gap:8px;align-items:center;background:#fff}
  .cb-inp{flex:1;border:1px solid var(--cb-line);border-radius:14px;padding:12px 14px;outline:none;box-shadow:0 1px 0 rgba(0,0,0,.02)}
  .cb-send{border:0;border-radius:14px;background:var(--cb-accent);color:#fff;padding:12px 14px;font-weight:700;cursor:pointer}
  .cb-send[disabled]{opacity:.6;cursor:not-allowed}
  @media (max-width: 480px){
    .cb-panel{right:8px;left:8px;bottom:80px;height:74vh;border-radius:16px}
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
    // very light markdown strip to keep output clean
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

      const btn = h("button", {
        className: "cb-btn",
        innerText: opts.bubbleText || "Chat",
      });
      btn.style.setProperty("--cb-brand", opts.brandColor || "#FF8A5B");
      document.body.appendChild(btn);

      const panel = h("div", { className: "cb-panel" });
      panel.style.setProperty("--cb-brand", opts.brandColor || "#FF8A5B");
      panel.style.setProperty("--cb-accent", opts.accentColor || "#0E7C86");

      // Header
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
          })
        )
      );

      const body = h("div", { className: "cb-body", role: "log" });
      const chipbar = h("div", { className: "cb-chipbar" });
      const foot = h("div", { className: "cb-foot" });

      const chips = [
        "I feel anxious about exams",
        "I can’t sleep well",
        "How do I ground myself?",
        "Help me plan study breaks",
      ];
      chips.forEach((c) =>
        chipbar.appendChild(
          h("button", { className: "cb-chip", onclick: () => send(c) }, c)
        )
      );

      const inp = h("input", {
        className: "cb-inp",
        placeholder: "Type your message…",
        ariaLabel: "Message",
      });
      const sendBtn = h("button", {
        className: "cb-send",
        innerText: "Send",
        onclick: () => send(inp.value),
      });

      // ENTER-TO-SEND (Shift+Enter = newline behavior not needed for input, but kept for consistency)
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          send(inp.value);
        }
      });

      foot.append(inp, sendBtn);
      panel.append(head, body, chipbar, foot);
      document.body.appendChild(panel);

      let open = false;
      btn.onclick = () => {
        open = !open;
        panel.style.display = open ? "block" : "none";
        if (open) inp.focus();
      };

      const add = (who, text) => {
        const msg = h("div", {
          className: `cb-msg ${who === "me" ? "cb-me" : "cb-bot"}`,
        });
        msg.textContent = mdSafe(text);
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
        if (!text) return;
        add("me", text);
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
            body: JSON.stringify({ message: text }),
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
      this.send = send;
    },
  };

  window.ChatbotWidget = ChatbotWidget;
})();
